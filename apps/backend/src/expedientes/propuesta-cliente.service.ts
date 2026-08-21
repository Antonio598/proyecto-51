import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  EstadoExpediente,
  OrigenDocumento,
  Prisma,
  TipoDocumento,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { PdfService } from '../generacion/pdf.service';
import { ClaudeService } from '../ia/claude.service';
import { CorreoService, plantillaCorreo } from '../correo/correo.service';
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
 * Módulo 6 — Propuesta final para el cliente.
 * Se genera automáticamente con los datos ya aprobados y se envía por WhatsApp.
 */
@Injectable()
export class PropuestaClienteService {
  private readonly logger = new Logger(PropuestaClienteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly pdf: PdfService,
    private readonly claude: ClaudeService,
    private readonly correo: CorreoService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Genera el PDF de la propuesta a partir de la aseguradora elegida.
   * El expediente debe estar aprobado.
   */
  async generar(
    expedienteId: string,
    aseguradoraId: string,
    flotaId: string | null,
    actorUserId: string,
  ) {
    const expediente = await this.cargar(expedienteId);

    if (expediente.estado !== EstadoExpediente.aprobado) {
      throw new BadRequestException(
        'El expediente debe estar aprobado por el área comercial antes de generar la propuesta',
      );
    }

    const elegida = expediente.propuestasAseguradora.find(
      (p) => p.aseguradoraId === aseguradoraId && (p.flotaId ?? null) === (flotaId ?? null),
    );
    if (!elegida) {
      throw new NotFoundException(
        'La aseguradora elegida no tiene propuesta para esta flota en el expediente',
      );
    }

    // Sólo las unidades de esta flota (todas si no hay flota).
    const unidades = expediente.cliente.unidades.filter(
      (u) => !flotaId || u.flotaId === flotaId,
    );

    // 1. Claude redacta los textos; los números salen de la base, no del modelo.
    const textos = await this.redactar(expediente, elegida, unidades);

    // 2. Armar el PDF con secciones fijas + textos redactados.
    const coberturas = elegida.coberturas as Coberturas | null;
    const deducibles = elegida.deducibles as Deducibles | null;

    const pdfBuffer = await this.pdf.generar({
      titulo: 'Propuesta de seguro para flota de transporte',
      subtitulo: `${expediente.cliente.razonSocial} · ${elegida.aseguradora.nombre} · ${new Date().toLocaleDateString('es-MX')}`,
      secciones: [
        { titulo: 'Resumen', parrafos: [textos.resumen] },
        {
          titulo: 'Alcance de cobertura',
          parrafos: [textos.alcance],
          tabla: {
            encabezados: ['Cobertura', 'Suma asegurada / condición'],
            filas: ORDEN_COBERTURAS.map((c) => [
              ETIQUETAS_COBERTURA[c],
              formatearCobertura(c, coberturas?.[c]),
            ]),
          },
        },
        {
          titulo: 'Deducibles',
          tabla: {
            encabezados: ['Concepto', 'Deducible'],
            filas: ORDEN_DEDUCIBLES.map((d) => [
              ETIQUETAS_DEDUCIBLE[d],
              formatearDeducible(deducibles?.[d]),
            ]),
          },
        },
        {
          titulo: 'Unidades a asegurar',
          tabla: {
            encabezados: ['Tipo', 'Marca / Modelo', 'Año', 'VIN', 'Valor asegurado'],
            filas: unidades.map((u) => [
              u.tipo,
              [u.marca, u.modelo].filter(Boolean).join(' ') || '—',
              u.anio ? String(u.anio) : '—',
              u.vin ?? '—',
              formatearMoneda(u.valorAsegurado ? Number(u.valorAsegurado) : null),
            ]),
          },
        },
        {
          titulo: 'Costos',
          parrafos: [
            `Prima anual con ${elegida.aseguradora.nombre}: ${formatearMoneda(
              elegida.prima ? Number(elegida.prima) : null,
            )}.`,
            'El pago es mensual, con corte cada 30 días naturales a partir del inicio de vigencia.',
          ],
        },
        { titulo: 'Condiciones', parrafos: [textos.condiciones] },
      ],
      piePagina: `${expediente.cliente.razonSocial} · Expediente ${expediente.folioInterno}`,
    });

    // 3. Guardar y registrar en el expediente.
    const nombre = `propuesta-${expediente.folioInterno}.pdf`;
    const storageKey = await this.storage.subir(
      `clientes/${expediente.clienteId}/propuestas`,
      nombre,
      pdfBuffer,
      'application/pdf',
    );
    const documento = await this.prisma.documento.create({
      data: {
        clienteId: expediente.clienteId,
        expedienteId: expediente.id,
        tipo: TipoDocumento.propuesta,
        origen: OrigenDocumento.generado,
        storageKey,
        mime: 'application/pdf',
        nombreOriginal: nombre,
        procesado: true,
      },
    });

    const contenido = { ...textos, aseguradoraId, flotaId } as unknown as Prisma.InputJsonValue;
    // Prisma no admite null en la llave compuesta; buscamos y creamos/actualizamos.
    const previa = await this.prisma.propuestaCliente.findFirst({
      where: { expedienteId, flotaId: flotaId ?? null },
    });
    const propuesta = previa
      ? await this.prisma.propuestaCliente.update({
          where: { id: previa.id },
          data: { contenido, pdfDocId: documento.id, enviadaEn: null },
        })
      : await this.prisma.propuestaCliente.create({
          data: { expedienteId, flotaId: flotaId ?? null, contenido, pdfDocId: documento.id },
        });

    await this.audit.registrar({
      entidad: 'PropuestaCliente',
      entidadId: propuesta.id,
      accion: 'generar',
      actorUserId,
      diff: { expedienteId, aseguradoraId },
    });

    return propuesta;
  }

  /** Envía la propuesta al cliente por correo y marca el expediente como enviado. */
  async enviar(expedienteId: string, flotaId: string | null, actorUserId: string) {
    const expediente = await this.cargar(expedienteId);
    const propuesta = expediente.propuestasCliente.find(
      (p) => (p.flotaId ?? null) === (flotaId ?? null),
    );

    if (!propuesta?.pdfDocId) {
      throw new BadRequestException('Genera la propuesta antes de enviarla');
    }
    if (!expediente.cliente.contactoEmail) {
      throw new BadRequestException(
        'El cliente no tiene correo registrado; agrégalo en su ficha',
      );
    }

    const documento = await this.prisma.documento.findUnique({
      where: { id: propuesta.pdfDocId },
    });
    if (!documento) throw new NotFoundException('No se encontró el PDF de la propuesta');

    const contenido = await this.storage.descargar(documento.storageKey);

    const html = plantillaCorreo(
      'Propuesta de seguro',
      `<p>Estimado cliente de ${expediente.cliente.razonSocial}:</p>
       <p>Adjuntamos la propuesta de seguro para su flota. Quedamos atentos a sus comentarios.</p>`,
    );

    await this.correo.enviar({
      para: expediente.cliente.contactoEmail,
      asunto: `Propuesta de seguro — ${expediente.cliente.razonSocial}`,
      html,
      adjuntos: [
        {
          nombre: documento.nombreOriginal ?? 'propuesta.pdf',
          contenido,
          tipo: documento.mime ?? 'application/pdf',
        },
      ],
    });

    await this.prisma.$transaction([
      this.prisma.propuestaCliente.update({
        where: { id: propuesta.id },
        data: { enviadaEn: new Date() },
      }),
      this.prisma.expediente.update({
        where: { id: expedienteId },
        data: { estado: EstadoExpediente.enviado_a_cliente },
      }),
    ]);

    await this.audit.registrar({
      entidad: 'PropuestaCliente',
      entidadId: propuesta.id,
      accion: 'enviar_correo',
      actorUserId,
      diff: { correo: expediente.cliente.contactoEmail },
    });

    this.logger.log(
      `Propuesta del expediente ${expediente.folioInterno} enviada a ${expediente.cliente.contactoEmail}`,
    );
    return { enviada: true, correo: expediente.cliente.contactoEmail };
  }

  // ── Utilidades internas ──

  /**
   * Claude redacta únicamente los textos narrativos.
   * Las cifras se toman de la base de datos para que no pueda inventarlas.
   */
  private async redactar(
    expediente: Awaited<ReturnType<PropuestaClienteService['cargar']>>,
    elegida: { aseguradora: { nombre: string }; prima: unknown; condiciones: string | null },
    unidades: Awaited<ReturnType<PropuestaClienteService['cargar']>>['cliente']['unidades'],
  ): Promise<{ resumen: string; alcance: string; condiciones: string }> {
    const contexto = {
      cliente: expediente.cliente.razonSocial,
      aseguradora: elegida.aseguradora.nombre,
      unidades: unidades.length,
      tiposUnidad: [...new Set(unidades.map((u) => u.tipo))],
      primaAnual: elegida.prima ? Number(elegida.prima) : null,
      siniestralidad: expediente.siniestralidad,
      condicionesAseguradora: elegida.condiciones,
    };

    return this.claude.redactarPropuesta(contexto);
  }

  private async cargar(expedienteId: string) {
    const expediente = await this.prisma.expediente.findUnique({
      where: { id: expedienteId },
      include: {
        cliente: { include: { unidades: { where: { activo: true } } } },
        propuestasAseguradora: { include: { aseguradora: true } },
        propuestasCliente: true,
      },
    });
    if (!expediente) throw new NotFoundException('Expediente no encontrado');
    return expediente;
  }
}
