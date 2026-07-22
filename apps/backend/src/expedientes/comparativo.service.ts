import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  EstadoExpediente,
  OrigenDocumento,
  Prisma,
  Rol,
  TipoDocumento,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { PdfService } from '../generacion/pdf.service';
import { ExcelService } from '../generacion/excel.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { AuditService } from '../audit/audit.service';
import {
  Coberturas,
  Deducibles,
  ETIQUETAS_COBERTURA,
  ETIQUETAS_DEDUCIBLE,
  ORDEN_COBERTURAS,
  ORDEN_DEDUCIBLES,
  formatearCobertura,
  formatearDeducible,
  formatearMoneda,
} from './coberturas';

/**
 * Genera el cuadro comparativo de propuestas.
 *
 * Se dispara AUTOMÁTICAMENTE en cuanto Técnico captura la última propuesta
 * pendiente del expediente — sin ningún paso manual adicional.
 */
@Injectable()
export class ComparativoService {
  private readonly logger = new Logger(ComparativoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly pdf: PdfService,
    private readonly excel: ExcelService,
    private readonly notificaciones: NotificacionesService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Comprueba si ya están todas las propuestas solicitadas y, de ser así,
   * genera el comparativo y avisa al director comercial.
   * @returns el comparativo generado, o null si aún faltan propuestas.
   */
  async generarSiEstaCompleto(expedienteId: string, actorUserId?: string) {
    const expediente = await this.cargar(expedienteId);

    const solicitadas = expediente.aseguradorasSolicitadas;
    const capturadas = expediente.propuestasAseguradora.map((p) => p.aseguradoraId);
    const faltantes = solicitadas.filter((id) => !capturadas.includes(id));

    if (solicitadas.length === 0 || faltantes.length > 0) {
      this.logger.log(
        `Expediente ${expedienteId}: faltan ${faltantes.length} propuesta(s) para el comparativo`,
      );
      return null;
    }

    return this.generar(expedienteId, actorUserId);
  }

  /** Genera (o regenera) el comparativo con las propuestas capturadas hasta ahora. */
  async generar(expedienteId: string, actorUserId?: string) {
    const expediente = await this.cargar(expedienteId);
    const propuestas = expediente.propuestasAseguradora;

    if (propuestas.length === 0) {
      throw new NotFoundException('No hay propuestas capturadas para comparar');
    }

    const tabla = this.construirTabla(propuestas);
    const nombreBase = `comparativo-${expediente.folioInterno}`;

    // 1. Exportar a PDF y Excel.
    const [pdfBuffer, excelBuffer] = await Promise.all([
      this.pdf.generar({
        titulo: 'Cuadro comparativo de propuestas',
        subtitulo: `${expediente.cliente.razonSocial} · Expediente ${expediente.folioInterno} · ${new Date().toLocaleDateString('es-MX')}`,
        secciones: [
          ...(expediente.siniestralidad
            ? [{ titulo: 'Siniestralidad reportada', parrafos: [expediente.siniestralidad] }]
            : []),
          { titulo: 'Comparativo de coberturas', tabla },
          {
            titulo: 'Condiciones particulares',
            parrafos: propuestas.map(
              (p) => `${p.aseguradora.nombre}: ${p.condiciones || 'Sin condiciones adicionales.'}`,
            ),
          },
        ],
        piePagina: expediente.cliente.razonSocial,
      }),
      this.excel.generar([
        {
          nombre: 'Comparativo',
          titulo: `Comparativo — ${expediente.cliente.razonSocial}`,
          encabezados: tabla.encabezados,
          filas: tabla.filas,
        },
      ]),
    ]);

    // 2. Guardar ambos como documentos del expediente.
    const carpeta = `clientes/${expediente.clienteId}/comparativos`;
    const [pdfDoc, excelDoc] = await Promise.all([
      this.guardarDocumento(
        expediente,
        carpeta,
        `${nombreBase}.pdf`,
        pdfBuffer,
        'application/pdf',
        TipoDocumento.comparativo,
      ),
      this.guardarDocumento(
        expediente,
        carpeta,
        `${nombreBase}.xlsx`,
        excelBuffer,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        TipoDocumento.comparativo,
      ),
    ]);

    const comparativo = await this.prisma.comparativo.create({
      data: {
        expedienteId,
        datosTabla: tabla as unknown as Prisma.InputJsonValue,
        pdfDocId: pdfDoc.id,
        excelDocId: excelDoc.id,
      },
    });

    // 3. Pasar a revisión comercial y notificar automáticamente.
    await this.prisma.expediente.update({
      where: { id: expedienteId },
      data: { estado: EstadoExpediente.en_revision_comercial },
    });

    await this.notificaciones.notificarRol({
      rol: Rol.comercial,
      titulo: 'Comparativo listo para revisión',
      mensaje: `El comparativo de ${expediente.cliente.razonSocial} (expediente ${expediente.folioInterno}) ya está generado con ${propuestas.length} propuesta(s).`,
      enlace: `/expedientes/${expedienteId}`,
      expedienteId,
    });

    await this.audit.registrar({
      entidad: 'Comparativo',
      entidadId: comparativo.id,
      accion: 'generar',
      actorUserId,
      diff: { expedienteId, propuestas: propuestas.length },
    });

    this.logger.log(
      `Comparativo ${comparativo.id} generado para el expediente ${expediente.folioInterno}`,
    );
    return comparativo;
  }

  // ── Utilidades internas ──

  private async cargar(expedienteId: string) {
    const expediente = await this.prisma.expediente.findUnique({
      where: { id: expedienteId },
      include: {
        cliente: true,
        propuestasAseguradora: {
          include: { aseguradora: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!expediente) throw new NotFoundException('Expediente no encontrado');
    return expediente;
  }

  /**
   * Matriz del comparativo: una columna por aseguradora, una fila por
   * cobertura / deducible / prima. El orden de filas es fijo.
   */
  private construirTabla(
    propuestas: { aseguradora: { nombre: string }; coberturas: unknown; deducibles: unknown; prima: unknown }[],
  ) {
    const encabezados = ['Concepto', ...propuestas.map((p) => p.aseguradora.nombre)];
    const filas: string[][] = [];

    for (const campo of ORDEN_COBERTURAS) {
      filas.push([
        ETIQUETAS_COBERTURA[campo],
        ...propuestas.map((p) =>
          formatearCobertura(campo, (p.coberturas as Coberturas | null)?.[campo]),
        ),
      ]);
    }

    for (const campo of ORDEN_DEDUCIBLES) {
      filas.push([
        ETIQUETAS_DEDUCIBLE[campo],
        ...propuestas.map((p) => formatearDeducible((p.deducibles as Deducibles | null)?.[campo])),
      ]);
    }

    filas.push([
      'Prima anual',
      ...propuestas.map((p) => formatearMoneda(p.prima ? Number(p.prima) : null)),
    ]);

    return { encabezados, filas };
  }

  private async guardarDocumento(
    expediente: { id: string; clienteId: string },
    carpeta: string,
    nombre: string,
    contenido: Buffer,
    mime: string,
    tipo: TipoDocumento,
  ) {
    const storageKey = await this.storage.subir(carpeta, nombre, contenido, mime);
    return this.prisma.documento.create({
      data: {
        clienteId: expediente.clienteId,
        expedienteId: expediente.id,
        tipo,
        origen: OrigenDocumento.generado,
        storageKey,
        mime,
        nombreOriginal: nombre,
        procesado: true,
      },
    });
  }
}
