import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EstadoCobranza, Prisma, Rol, TipoDocumento } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ClaudeService } from '../ia/claude.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { CandidatoConciliacion, matchUnico, puntuarCandidatos } from './puntuacion';

export type { CandidatoConciliacion } from './puntuacion';

/**
 * Módulo 10 — Conciliación automática de comprobantes de pago.
 *
 * El cliente paga directo a la aseguradora y manda el comprobante por WhatsApp.
 * Claude lo lee y el sistema busca a qué póliza/periodo corresponde, para que
 * nadie tenga que rastrearlo manualmente.
 *
 * Cuando el match no es único, se proponen candidatos ordenados y un humano
 * confirma con un clic — nunca se adivina en silencio.
 */
@Injectable()
export class ConciliacionService {
  private readonly logger = new Logger(ConciliacionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly claude: ClaudeService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  /**
   * Intenta conciliar un documento recibido como comprobante de pago.
   * Se invoca automáticamente al recibir un adjunto de un cliente con cortes abiertos.
   */
  async intentar(documentoId: string) {
    const documento = await this.prisma.documento.findUnique({
      where: { id: documentoId },
      include: { cliente: true },
    });
    if (!documento) throw new NotFoundException('Documento no encontrado');
    if (!documento.clienteId) {
      return { conciliado: false, motivo: 'documento sin cliente identificado' };
    }

    // 1. Leer el comprobante con Claude.
    const contenido = await this.storage.descargar(documento.storageKey);
    const lectura = await this.claude.leerComprobantePago(
      contenido,
      documento.mime ?? 'application/octet-stream',
    );

    if (!lectura.monto || lectura.confianza < 0.5) {
      this.logger.log(`Documento ${documentoId} no parece un comprobante de pago`);
      return { conciliado: false, motivo: 'no parece un comprobante', lectura };
    }

    // 2. Buscar cortes abiertos del cliente y puntuar candidatos.
    const cortes = await this.prisma.corte.findMany({
      where: {
        estado: { not: EstadoCobranza.pagado },
        poliza: { clienteId: documento.clienteId },
      },
      include: { poliza: { include: { aseguradora: true } } },
      orderBy: { fechaProximoPago: 'asc' },
    });

    const candidatos = puntuarCandidatos(
      cortes.map((c) => ({
        id: c.id,
        polizaId: c.polizaId,
        periodo: c.periodo,
        montoEsperado: c.montoEsperado ? Number(c.montoEsperado) : 0,
        fechaProximoPago: c.fechaProximoPago,
        folio: c.poliza.folio,
        aseguradora: c.poliza.aseguradora.nombre,
      })),
      lectura.monto,
      lectura.fecha ? new Date(lectura.fecha) : null,
    );

    // 3. Clasificar el documento y guardar la lectura.
    await this.prisma.documento.update({
      where: { id: documentoId },
      data: {
        tipo: TipoDocumento.comprobante_pago,
        metadata: {
          ...((documento.metadata as object) ?? {}),
          lecturaComprobante: lectura,
          candidatos: candidatos.slice(0, 5),
        } as unknown as Prisma.InputJsonValue,
      },
    });

    const sugerido = matchUnico(candidatos);

    await this.notificaciones.notificarRol({
      rol: Rol.administracion,
      titulo: sugerido
        ? 'Comprobante de pago conciliado'
        : 'Comprobante recibido — requiere confirmación',
      mensaje: sugerido
        ? `${documento.cliente?.razonSocial}: comprobante por ${this.fmt(lectura.monto)} conciliado con la póliza ${sugerido.folio ?? sugerido.polizaId} (${sugerido.periodo}).`
        : `${documento.cliente?.razonSocial}: comprobante por ${this.fmt(lectura.monto)} con ${candidatos.length} posible(s) coincidencia(s). Confirma a cuál aplica.`,
      enlace: `/pagos?documento=${documentoId}`,
    });

    this.logger.log(
      `Comprobante ${documentoId}: ${candidatos.length} candidato(s), match único: ${!!sugerido}`,
    );

    return {
      conciliado: !!sugerido,
      lectura,
      candidatos,
      sugerido,
    };
  }

  /** Devuelve la lectura y los candidatos ya calculados de un documento. */
  async detalle(documentoId: string) {
    const documento = await this.prisma.documento.findUnique({
      where: { id: documentoId },
      include: { cliente: { select: { id: true, razonSocial: true } } },
    });
    if (!documento) throw new NotFoundException('Documento no encontrado');

    const metadata = (documento.metadata ?? {}) as Record<string, unknown>;
    return {
      documento,
      lectura: metadata.lecturaComprobante ?? null,
      candidatos: (metadata.candidatos as CandidatoConciliacion[]) ?? [],
    };
  }

  /** Comprobantes recibidos que todavía no se convirtieron en pago registrado. */
  pendientes() {
    return this.prisma.documento.findMany({
      where: { tipo: TipoDocumento.comprobante_pago, procesado: false },
      orderBy: { createdAt: 'desc' },
      include: { cliente: { select: { id: true, razonSocial: true } } },
    });
  }

  // ── Utilidades internas ──

  private fmt(valor: number): string {
    return valor.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
  }
}
