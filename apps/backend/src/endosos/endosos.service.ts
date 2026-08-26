import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  EstadoPoliza,
  MovimientoEndoso,
  OrigenDocumento,
  TipoDocumento,
  TipoUnidad,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ClaudeService } from '../ia/claude.service';
import { AuditService } from '../audit/audit.service';
import { PolizasMadreService } from '../cobranza/polizas-madre.service';
import { normalizarRfc } from '../clientes/rfc.util';

/**
 * Módulo de endosos: alta / baja / cancelación leídos por IA de un documento.
 * La póliza se localiza por número de serie (VIN). La aplicación es manual
 * (confirmada por una persona) porque cambia el estado y la cobranza. Las bajas
 * NO borran la póliza: la marcan cancelada y la sacan del total de la Madre.
 */
@Injectable()
export class EndososService {
  private readonly logger = new Logger(EndososService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly claude: ClaudeService,
    private readonly audit: AuditService,
    private readonly polizasMadre: PolizasMadreService,
  ) {}

  /**
   * Lee un documento de endoso, localiza la póliza por serie y crea un endoso
   * pendiente de aplicar (para que una persona confirme el movimiento).
   */
  async procesar(
    archivo: { buffer: Buffer; nombre: string; mime: string },
    actorUserId: string,
  ) {
    let lectura: Awaited<ReturnType<ClaudeService['leerEndoso']>>;
    try {
      lectura = await this.claude.leerEndoso(archivo.buffer, archivo.mime);
    } catch (err) {
      this.logger.error(`No se pudo leer el endoso con IA: ${(err as Error).message}`);
      throw new BadRequestException(
        `No se pudo leer el endoso con IA: ${(err as Error).message}. Verifica que el archivo sea legible (PDF o imagen).`,
      );
    }
    const serie = lectura.serie?.trim() || null;
    const rfc = normalizarRfc(lectura.rfc);

    // Localiza la póliza por número de serie (unidad.vin).
    const poliza = serie
      ? await this.prisma.poliza.findFirst({
          where: { unidad: { vin: { equals: serie, mode: 'insensitive' } } },
          orderBy: { createdAt: 'desc' },
          include: {
            cliente: { select: { id: true, razonSocial: true, rfc: true } },
            aseguradora: { select: { nombre: true } },
          },
        })
      : null;

    // Guarda el documento del endoso.
    const clienteId = poliza?.clienteId ?? null;
    const storageKey = await this.storage.subir(
      clienteId ? `clientes/${clienteId}/endosos` : 'endosos',
      archivo.nombre,
      archivo.buffer,
      archivo.mime,
    );
    const documento = await this.prisma.documento.create({
      data: {
        clienteId,
        polizaId: poliza?.id ?? null,
        tipo: TipoDocumento.recibido,
        origen: OrigenDocumento.manual_upload,
        storageKey,
        mime: archivo.mime,
        nombreOriginal: archivo.nombre,
        procesado: true,
      },
    });

    const endoso = await this.prisma.endoso.create({
      data: {
        movimiento: this.movimientoDe(lectura.movimiento),
        serie,
        rfc,
        importe: lectura.importe != null ? (lectura.importe as never) : null,
        polizaId: poliza?.id ?? null,
        storageDocId: documento.id,
        notas: lectura.confianza < 0.5 ? 'Lectura de baja confianza; verifica el movimiento.' : null,
      },
    });

    await this.audit.registrar({
      entidad: 'Endoso',
      entidadId: endoso.id,
      accion: 'procesar',
      actorUserId,
      diff: { movimiento: endoso.movimiento, serie, polizaEncontrada: !!poliza },
    });

    // Para un ALTA sin póliza localizada, buscamos al cliente por RFC para poder
    // crear la póliza hija (con su flota) desde el frontend.
    const clienteAlta =
      !poliza && endoso.movimiento === MovimientoEndoso.alta && rfc
        ? await this.prisma.cliente.findUnique({
            where: { rfc },
            select: {
              id: true,
              razonSocial: true,
              rfc: true,
              flotas: { select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } },
            },
          })
        : null;

    return {
      endoso,
      lectura,
      poliza: poliza
        ? {
            id: poliza.id,
            folio: poliza.folio,
            estado: poliza.estado,
            aseguradora: poliza.aseguradora.nombre,
            cliente: poliza.cliente,
            polizaMadreId: poliza.polizaMadreId,
          }
        : null,
      clienteAlta,
    };
  }

  /** Aplica el endoso ya confirmado: baja = cancela; alta = marca alta verde. */
  async aplicar(endosoId: string, actorUserId: string) {
    const endoso = await this.prisma.endoso.findUnique({
      where: { id: endosoId },
      include: { poliza: true },
    });
    if (!endoso) throw new NotFoundException('Endoso no encontrado');
    if (endoso.aplicadoEn) throw new BadRequestException('Este endoso ya fue aplicado');
    if (!endoso.polizaId || !endoso.poliza) {
      throw new BadRequestException(
        'No se localizó la póliza por número de serie. Regístrala/emítela antes de aplicar el endoso.',
      );
    }

    if (
      endoso.movimiento === MovimientoEndoso.baja ||
      endoso.movimiento === MovimientoEndoso.cancelacion
    ) {
      await this.prisma.poliza.update({
        where: { id: endoso.polizaId },
        data: { estado: EstadoPoliza.cancelada, canceladaEn: new Date() },
      });
    } else {
      // Alta: la póliza queda marcada como alta reciente (verde) y vinculada a su Madre.
      await this.prisma.poliza.update({
        where: { id: endoso.polizaId },
        data: { altaPorEndoso: true },
      });
      await this.polizasMadre.vincularHija(endoso.polizaId);
    }

    // Refresca los totales de la Madre (excluye canceladas, incluye altas).
    if (endoso.poliza.polizaMadreId) {
      await this.polizasMadre.recalcularTotales(endoso.poliza.polizaMadreId);
    }

    const actualizado = await this.prisma.endoso.update({
      where: { id: endosoId },
      data: { aplicadoEn: new Date() },
    });

    await this.audit.registrar({
      entidad: 'Endoso',
      entidadId: endosoId,
      accion: 'aplicar',
      actorUserId,
      diff: { movimiento: endoso.movimiento, polizaId: endoso.polizaId },
    });

    this.logger.log(`Endoso ${endosoId} (${endoso.movimiento}) aplicado a póliza ${endoso.polizaId}`);
    return actualizado;
  }

  /**
   * Aplica un ALTA creando una póliza hija nueva para el cliente (por RFC). Se le
   * asigna la flota indicada (o la flota "General" del cliente), se marca como
   * "alta reciente" y se agrega a la cobranza de su Póliza Madre.
   */
  async aplicarAlta(
    endosoId: string,
    datos: { aseguradoraId: string; flotaId?: string },
    actorUserId: string,
  ) {
    const endoso = await this.prisma.endoso.findUnique({ where: { id: endosoId } });
    if (!endoso) throw new NotFoundException('Endoso no encontrado');
    if (endoso.aplicadoEn) throw new BadRequestException('Este endoso ya fue aplicado');
    if (endoso.movimiento !== MovimientoEndoso.alta) {
      throw new BadRequestException('Este movimiento no es un alta');
    }
    const rfc = normalizarRfc(endoso.rfc);
    if (!rfc) throw new BadRequestException('El endoso no trae RFC para identificar al cliente');

    const cliente = await this.prisma.cliente.findUnique({ where: { rfc } });
    if (!cliente) {
      throw new NotFoundException(`No hay un cliente con el RFC ${rfc}. Créalo antes de dar el alta.`);
    }
    const aseguradora = await this.prisma.aseguradora.findUnique({
      where: { id: datos.aseguradoraId },
    });
    if (!aseguradora) throw new NotFoundException('Aseguradora no encontrada');

    // Flota: la elegida (validada) o la "General" del cliente.
    let flotaId = datos.flotaId ?? null;
    if (flotaId) {
      const flota = await this.prisma.flota.findFirst({
        where: { id: flotaId, clienteId: cliente.id },
      });
      if (!flota) throw new BadRequestException('La flota no pertenece a este cliente');
    } else {
      flotaId = (await this.flotaGeneral(cliente.id)).id;
    }

    // Crear la unidad (por serie) y la póliza hija emitida marcada como alta.
    const inicio = new Date();
    const fin = new Date(inicio);
    fin.setFullYear(fin.getFullYear() + 1);
    const unidad = await this.prisma.unidad.create({
      data: { clienteId: cliente.id, vin: endoso.serie, flotaId, tipo: TipoUnidad.otro },
    });
    const poliza = await this.prisma.poliza.create({
      data: {
        clienteId: cliente.id,
        unidadId: unidad.id,
        aseguradoraId: datos.aseguradoraId,
        estado: EstadoPoliza.emitida,
        altaPorEndoso: true,
        prima: endoso.importe as never,
        vigenciaInicio: inicio,
        vigenciaFin: fin,
      },
    });

    // Vincular a la Madre (cliente, flota, aseguradora) y refrescar cobranza.
    const madreId = await this.polizasMadre.vincularHija(poliza.id);

    const actualizado = await this.prisma.endoso.update({
      where: { id: endosoId },
      data: { polizaId: poliza.id, aplicadoEn: new Date() },
    });

    await this.audit.registrar({
      entidad: 'Endoso',
      entidadId: endosoId,
      accion: 'aplicar_alta',
      actorUserId,
      diff: { clienteId: cliente.id, polizaId: poliza.id, flotaId, aseguradoraId: datos.aseguradoraId },
    });

    this.logger.log(`Alta por endoso ${endosoId}: póliza ${poliza.id} creada para ${cliente.razonSocial}`);
    return { endoso: actualizado, polizaId: poliza.id, madreId };
  }

  /** Flota "General" del cliente (se crea si no existe) para altas sin flota. */
  private async flotaGeneral(clienteId: string) {
    const existente = await this.prisma.flota.findFirst({
      where: { clienteId, nombre: 'General' },
    });
    if (existente) return existente;
    return this.prisma.flota.create({ data: { clienteId, nombre: 'General' } });
  }

  /** Endosos recientes para la sección de altas/bajas. */
  listar() {
    return this.prisma.endoso.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        poliza: {
          select: {
            id: true,
            folio: true,
            estado: true,
            cliente: { select: { razonSocial: true, rfc: true } },
            aseguradora: { select: { nombre: true } },
          },
        },
      },
    });
  }

  private movimientoDe(valor: string | null): MovimientoEndoso {
    if (valor === 'alta') return MovimientoEndoso.alta;
    if (valor === 'baja') return MovimientoEndoso.baja;
    // Por defecto, tratar como cancelación (el caso más común de "dar de baja").
    return MovimientoEndoso.cancelacion;
  }
}
