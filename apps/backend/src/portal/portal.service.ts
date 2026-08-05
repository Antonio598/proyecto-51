import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EstadoCobranza, OrigenDocumento, Rol, TipoDocumento } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { ConciliacionService } from '../pagos/conciliacion.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

/** Extensiones que el portal acepta subir. */
const EXTENSIONES_OK = ['xlsx', 'xls', 'csv', 'pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif'];
/** Tamaño máximo por archivo (15 MB). */
const TAM_MAX = 15 * 1024 * 1024;

export interface ArchivoSubido {
  buffer: Buffer;
  nombre: string;
  mime: string;
}

/**
 * Portal público de autoservicio. El cliente sube archivos poniendo su
 * teléfono y correo; se vinculan por teléfono (misma clave que WhatsApp) y
 * entran a la misma bandeja de "documentos por procesar".
 */
@Injectable()
export class PortalService {
  private readonly logger = new Logger(PortalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notificaciones: NotificacionesService,
    private readonly conciliacion: ConciliacionService,
  ) {}

  async recibir(datos: {
    telefono: string;
    email: string;
    nombre?: string;
    archivos: ArchivoSubido[];
  }) {
    if (!datos.archivos?.length) {
      throw new BadRequestException('Adjunta al menos un archivo.');
    }
    for (const a of datos.archivos) {
      this.validarArchivo(a);
    }

    const numero = WhatsappService.normalizarNumero(datos.telefono);
    if (numero.replace(/\D/g, '').length < 10) {
      throw new BadRequestException('El teléfono no parece válido.');
    }

    // 1. Buscar el cliente por teléfono; si no existe, crearlo.
    const { cliente, creado } = await this.buscarOCrearCliente(numero, datos.email, datos.nombre);

    // 2. Guardar cada archivo y registrarlo en la bandeja.
    const documentos = [];
    for (const archivo of datos.archivos) {
      const storageKey = await this.storage.subir(
        `clientes/${cliente.id}/recibidos`,
        archivo.nombre,
        archivo.buffer,
        archivo.mime,
      );
      const documento = await this.prisma.documento.create({
        data: {
          clienteId: cliente.id,
          tipo: TipoDocumento.recibido,
          origen: OrigenDocumento.portal,
          storageKey,
          mime: archivo.mime,
          nombreOriginal: archivo.nombre,
          procesado: false,
          metadata: { telefono: numero, email: datos.email, nombre: datos.nombre ?? null },
        },
      });
      documentos.push(documento);
    }

    // 3. Avisar al equipo de captura.
    await this.notificaciones.notificarRol({
      rol: Rol.captura,
      titulo: 'Documentos recibidos por el portal',
      mensaje:
        `${cliente.razonSocial} (${numero}) subió ${documentos.length} archivo(s) por el portal` +
        (creado ? ' — cliente nuevo, revisar sus datos.' : '.'),
      enlace: '/documentos',
    });

    // 4. Si es un cliente existente con cobros abiertos, intentar conciliar
    //    (por si alguno de los archivos es un comprobante de pago).
    if (!creado) {
      for (const doc of documentos) {
        void this.conciliarSiProcede(cliente.id, doc.id);
      }
    }

    this.logger.log(
      `Portal: ${documentos.length} documento(s) de ${numero}` +
        (creado ? ' (cliente creado)' : ` (${cliente.razonSocial})`),
    );

    return { recibidos: documentos.length, clienteNuevo: creado };
  }

  /**
   * Consulta de autoservicio: el cliente teclea su teléfono + correo y ve la
   * información que el despacho tiene sobre él (flota, pólizas y cobranza).
   *
   * Sin OTP, la contención es doble: teléfono Y correo deben coincidir con el
   * registro. Si algo no cuadra se responde con un mensaje genérico para no
   * revelar si un número existe o no.
   */
  async consultar(datos: { telefono: string; email: string }) {
    const numero = WhatsappService.normalizarNumero(datos.telefono);
    const email = datos.email.trim().toLowerCase();

    const cliente = await this.prisma.cliente.findUnique({
      where: { whatsappNumber: numero },
      include: {
        unidades: { where: { activo: true }, orderBy: { createdAt: 'asc' } },
        polizas: {
          orderBy: { vigenciaInicio: 'desc' },
          include: {
            aseguradora: { select: { nombre: true } },
            unidad: { select: { marca: true, modelo: true, vin: true, numeroEconomico: true } },
            cortes: { orderBy: { fechaProximoPago: 'asc' } },
          },
        },
      },
    });

    const correoCoincide =
      cliente?.contactoEmail && cliente.contactoEmail.trim().toLowerCase() === email;
    if (!cliente || !correoCoincide) {
      throw new NotFoundException(
        'No encontramos información con ese teléfono y correo. Verifica que sean los mismos que registraste con el despacho.',
      );
    }

    // Cobranza abierta (todo lo que no esté pagado), aplanada por póliza.
    const cobranza = cliente.polizas.flatMap((p) =>
      p.cortes
        .filter((c) => c.estado !== EstadoCobranza.pagado)
        .map((c) => ({
          periodo: c.periodo,
          estado: c.estado,
          montoEsperado: c.montoEsperado,
          fechaProximoPago: c.fechaProximoPago,
          aseguradora: p.aseguradora.nombre,
          unidad: [p.unidad.marca, p.unidad.modelo].filter(Boolean).join(' ') || p.unidad.vin,
        })),
    );

    return {
      cliente: {
        razonSocial: cliente.razonSocial,
        contactoNombre: cliente.contactoNombre,
        contactoEmail: cliente.contactoEmail,
        telefono: cliente.whatsappNumber,
      },
      unidades: cliente.unidades,
      polizas: cliente.polizas.map((p) => ({
        id: p.id,
        folio: p.folio,
        estado: p.estado,
        vigenciaInicio: p.vigenciaInicio,
        vigenciaFin: p.vigenciaFin,
        aseguradora: p.aseguradora.nombre,
        unidad: [p.unidad.marca, p.unidad.modelo].filter(Boolean).join(' ') || p.unidad.vin,
      })),
      cobranza,
    };
  }

  // ── Utilidades internas ──

  private async buscarOCrearCliente(numero: string, email: string, nombre?: string) {
    const existente = await this.prisma.cliente.findUnique({ where: { whatsappNumber: numero } });
    if (existente) {
      // Completar el correo si el cliente no tenía uno.
      if (!existente.contactoEmail && email) {
        await this.prisma.cliente.update({
          where: { id: existente.id },
          data: { contactoEmail: email },
        });
      }
      return { cliente: existente, creado: false };
    }

    const cliente = await this.prisma.cliente.create({
      data: {
        // Nombre provisional: lo que teclee el cliente, o un marcador que el equipo completa.
        razonSocial: nombre?.trim() || `Cliente portal ${numero}`,
        contactoEmail: email || null,
        contactoNombre: nombre?.trim() || null,
        whatsappNumber: numero,
        notas: 'Cliente creado automáticamente desde el portal de autoservicio.',
      },
    });
    return { cliente, creado: true };
  }

  private validarArchivo(a: ArchivoSubido) {
    const ext = (a.nombre.split('.').pop() ?? '').toLowerCase();
    if (!EXTENSIONES_OK.includes(ext)) {
      throw new BadRequestException(
        `Tipo de archivo no permitido: .${ext}. Acepta: ${EXTENSIONES_OK.join(', ')}.`,
      );
    }
    if (a.buffer.length > TAM_MAX) {
      throw new BadRequestException(`"${a.nombre}" supera el tamaño máximo de 15 MB.`);
    }
  }

  /** Conciliación oportunista en segundo plano (mismo criterio que la ingesta de WhatsApp). */
  private async conciliarSiProcede(clienteId: string, documentoId: string) {
    try {
      const cobrosAbiertos = await this.prisma.corte.count({
        where: { estado: { not: EstadoCobranza.pagado }, poliza: { clienteId } },
      });
      if (cobrosAbiertos === 0) return;
      await this.conciliacion.intentar(documentoId);
    } catch (err) {
      this.logger.warn(
        `No se pudo conciliar el documento ${documentoId} del portal: ${(err as Error).message}`,
      );
    }
  }
}
