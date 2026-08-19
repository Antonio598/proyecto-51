import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FormaPago, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CobranzaService } from '../cobranza/cobranza.service';

@Injectable()
export class PagosService {
  private readonly logger = new Logger(PagosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cobranza: CobranzaService,
  ) {}

  /**
   * Registra un pago pendiente de aplicar en el portal, a partir del comprobante
   * conciliado. No cierra el corte todavía: eso ocurre al confirmar la aplicación.
   */
  async registrarDesdeComprobante(
    datos: {
      corteMadreId: string;
      documentoId: string;
      monto: number;
      fecha: Date;
      forma?: FormaPago;
    },
    actorUserId: string,
  ) {
    const corte = await this.prisma.corteMadre.findUnique({
      where: { id: datos.corteMadreId },
      include: { polizaMadre: { include: { hijas: { take: 1, orderBy: { createdAt: 'asc' } } } } },
    });
    if (!corte) throw new NotFoundException('Parcialidad de cobranza no encontrada');
    // El pago se aplica a la Madre; se ancla a una hija representativa porque el
    // modelo Pago exige póliza. El vínculo real es `corteMadreId`.
    const hija = corte.polizaMadre.hijas[0];
    if (!hija) {
      throw new BadRequestException('La Póliza Madre no tiene pólizas a las cuales aplicar el pago');
    }

    const pago = await this.prisma.pago.create({
      data: {
        polizaId: hija.id,
        corteMadreId: corte.id,
        fecha: datos.fecha,
        monto: datos.monto as never,
        forma: datos.forma ?? FormaPago.transferencia,
        comprobanteDocId: datos.documentoId,
        aplicadoEnPortal: false,
        registradoPorId: actorUserId,
      },
    });

    await this.audit.registrar({
      entidad: 'Pago',
      entidadId: pago.id,
      accion: 'registrar',
      actorUserId,
      diff: { corteMadreId: corte.id, monto: datos.monto },
    });

    return pago;
  }

  /** Pagos capturados que aún no se marcan como aplicados en el portal. */
  pendientesDeAplicar() {
    return this.prisma.pago.findMany({
      where: { aplicadoEnPortal: false },
      orderBy: { createdAt: 'asc' },
      include: {
        poliza: {
          include: {
            cliente: { select: { id: true, razonSocial: true } },
            aseguradora: { select: { nombre: true } },
            unidad: { select: { vin: true, marca: true, modelo: true } },
          },
        },
        corteMadre: true,
      },
    });
  }

  /**
   * El único clic manual del flujo de pagos: la persona ya lo aplicó en el
   * portal de la aseguradora y lo confirma aquí. Con eso el sistema cierra el
   * corte, abre el siguiente a 30 días y lo quita de pendientes — sin pedir
   * ningún dato que ya tenga.
   */
  async confirmarAplicado(pagoId: string, actorUserId: string) {
    const pago = await this.prisma.pago.findUnique({ where: { id: pagoId } });
    if (!pago) throw new NotFoundException('Pago no encontrado');
    if (pago.aplicadoEnPortal) {
      throw new BadRequestException('Este pago ya estaba marcado como aplicado');
    }

    await this.prisma.pago.update({
      where: { id: pagoId },
      data: { aplicadoEnPortal: true },
    });

    // Cierra la parcialidad pagada de la Madre y abre automáticamente la siguiente.
    const siguiente = pago.corteMadreId
      ? await this.cobranza.cerrarYAbrirSiguiente(pago.corteMadreId)
      : null;

    // El comprobante deja de estar pendiente en la bandeja.
    if (pago.comprobanteDocId) {
      await this.prisma.documento.update({
        where: { id: pago.comprobanteDocId },
        data: { procesado: true },
      });
    }

    await this.audit.registrar({
      entidad: 'Pago',
      entidadId: pagoId,
      accion: 'aplicado_en_portal',
      actorUserId,
      diff: { siguienteCorte: siguiente?.id ?? null } as unknown as Prisma.InputJsonValue,
    });

    this.logger.log(`Pago ${pagoId} aplicado; siguiente corte: ${siguiente?.periodo ?? 'n/a'}`);
    return { aplicado: true, siguienteCorte: siguiente };
  }

  listarPorPoliza(polizaId: string) {
    return this.prisma.pago.findMany({
      where: { polizaId },
      orderBy: { fecha: 'desc' },
      include: { corteMadre: true },
    });
  }
}
