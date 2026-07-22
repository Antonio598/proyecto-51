import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EstadoRevision, OrigenDocumento, Prisma, TipoUnidad } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { ClaudeService, UnidadExtraida } from '../ia/claude.service';

/** Debajo de este umbral, el campo se marca para revisión humana obligatoria. */
export const UMBRAL_CONFIANZA = 0.8;

@Injectable()
export class DocumentosService {
  private readonly logger = new Logger(DocumentosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly claude: ClaudeService,
    private readonly audit: AuditService,
  ) {}

  /** Bandeja: documentos recibidos por WhatsApp que aún no se procesan. */
  bandeja() {
    return this.prisma.documento.findMany({
      where: { origen: OrigenDocumento.whatsapp, procesado: false },
      orderBy: { createdAt: 'desc' },
      include: {
        cliente: { select: { id: true, razonSocial: true } },
        extraccion: { select: { id: true, estadoRevision: true } },
      },
    });
  }

  async obtener(id: string) {
    const documento = await this.prisma.documento.findUnique({
      where: { id },
      include: {
        cliente: { select: { id: true, razonSocial: true } },
        extraccion: true,
      },
    });
    if (!documento) throw new NotFoundException('Documento no encontrado');
    return documento;
  }

  /** Enlace temporal para previsualizar el archivo desde el panel. */
  async enlace(id: string) {
    const documento = await this.obtener(id);
    return { url: await this.storage.urlFirmada(documento.storageKey) };
  }

  /**
   * Ejecuta la extracción con Claude y guarda el resultado con su confianza por campo.
   * Idempotente: si ya existe una extracción, la reemplaza.
   */
  async extraer(documentoId: string, actorUserId?: string) {
    const documento = await this.obtener(documentoId);
    const contenido = await this.storage.descargar(documento.storageKey);

    const resultado = await this.claude.extraerUnidades(
      contenido,
      documento.mime ?? 'application/octet-stream',
      documento.nombreOriginal ?? 'documento',
    );

    const camposExtraidos = {
      unidades: resultado.unidades.map((u) => this.sinConfianza(u)),
      notas: resultado.notas,
    };
    const confianzaPorCampo = {
      unidades: resultado.unidades.map((u) => u.confianza ?? {}),
    };

    const extraccion = await this.prisma.extraccion.upsert({
      where: { documentoId },
      create: {
        documentoId,
        camposExtraidos: camposExtraidos as Prisma.InputJsonValue,
        confianzaPorCampo: confianzaPorCampo as Prisma.InputJsonValue,
        modeloUsado: resultado.modeloUsado,
        estadoRevision: EstadoRevision.pendiente,
      },
      update: {
        camposExtraidos: camposExtraidos as Prisma.InputJsonValue,
        confianzaPorCampo: confianzaPorCampo as Prisma.InputJsonValue,
        modeloUsado: resultado.modeloUsado,
        estadoRevision: EstadoRevision.pendiente,
        revisadoPorId: null,
        revisadoEn: null,
      },
    });

    await this.audit.registrar({
      entidad: 'Extraccion',
      entidadId: extraccion.id,
      accion: 'extraer',
      actorUserId,
      diff: { documentoId, unidades: resultado.unidades.length, modelo: resultado.modeloUsado },
    });

    this.logger.log(
      `Extracción ${extraccion.id}: ${resultado.unidades.length} unidades del documento ${documentoId}`,
    );
    return this.conBanderas(extraccion);
  }

  /** Devuelve la extracción con las banderas de "requiere revisión" ya calculadas. */
  async revision(documentoId: string) {
    const documento = await this.obtener(documentoId);
    if (!documento.extraccion) {
      throw new NotFoundException('Este documento aún no tiene extracción');
    }
    return this.conBanderas(documento.extraccion);
  }

  /**
   * Aprueba la extracción (con las correcciones del usuario) y crea las unidades
   * en la flota del cliente. Este es el paso que mueve datos a producción.
   */
  async aprobar(
    documentoId: string,
    unidadesCorregidas: UnidadCorregida[],
    clienteIdOverride: string | undefined,
    actorUserId: string,
  ) {
    const documento = await this.obtener(documentoId);
    const clienteId = clienteIdOverride ?? documento.clienteId;
    if (!clienteId) {
      throw new BadRequestException(
        'El documento no está asociado a un cliente; selecciona uno antes de aprobar',
      );
    }
    if (!documento.extraccion) {
      throw new NotFoundException('Este documento aún no tiene extracción');
    }

    const creadas = await this.prisma.$transaction(async (tx) => {
      const unidades = [];
      for (const u of unidadesCorregidas) {
        unidades.push(
          await tx.unidad.create({
            data: {
              clienteId,
              tipo: (u.tipo as TipoUnidad) ?? TipoUnidad.otro,
              vin: u.vin ?? null,
              anio: u.anio ?? null,
              marca: u.marca ?? null,
              modelo: u.modelo ?? null,
              descripcion: u.descripcion ?? null,
              tipoCarga: u.tipoCarga ?? null,
              valorAsegurado: u.valorAsegurado ?? null,
              camposExtra: { origenDocumentoId: documentoId } as Prisma.InputJsonValue,
            },
          }),
        );
      }

      await tx.extraccion.update({
        where: { documentoId },
        data: {
          estadoRevision: EstadoRevision.aprobado,
          revisadoPorId: actorUserId,
          revisadoEn: new Date(),
          camposExtraidos: {
            unidades: unidadesCorregidas,
            notas: (documento.extraccion!.camposExtraidos as any)?.notas ?? '',
          } as unknown as Prisma.InputJsonValue,
        },
      });

      await tx.documento.update({
        where: { id: documentoId },
        data: { procesado: true, clienteId },
      });

      return unidades;
    });

    await this.audit.registrar({
      entidad: 'Documento',
      entidadId: documentoId,
      accion: 'aprobar_extraccion',
      actorUserId,
      diff: { clienteId, unidadesCreadas: creadas.length },
    });

    return { unidadesCreadas: creadas.length, unidades: creadas };
  }

  /** Descarta el documento sin crear unidades (spam, duplicado, ilegible). */
  async descartar(documentoId: string, actorUserId: string) {
    await this.obtener(documentoId);
    await this.prisma.documento.update({
      where: { id: documentoId },
      data: { procesado: true },
    });
    await this.audit.registrar({
      entidad: 'Documento',
      entidadId: documentoId,
      accion: 'descartar',
      actorUserId,
    });
    return { ok: true };
  }

  // ── Utilidades internas ──

  private sinConfianza(unidad: UnidadExtraida) {
    const { confianza, ...resto } = unidad;
    return resto;
  }

  /**
   * Marca qué campos quedaron por debajo del umbral, para que la pantalla de
   * revisión los resalte y el usuario no tenga que leer todo el documento.
   */
  private conBanderas(extraccion: {
    camposExtraidos: Prisma.JsonValue;
    confianzaPorCampo: Prisma.JsonValue;
    [k: string]: unknown;
  }) {
    const confianzas = ((extraccion.confianzaPorCampo as any)?.unidades ?? []) as Record<
      string,
      number
    >[];
    const camposDudosos = confianzas.map((c) =>
      Object.entries(c ?? {})
        .filter(([, valor]) => typeof valor === 'number' && valor < UMBRAL_CONFIANZA)
        .map(([campo]) => campo),
    );
    return {
      ...extraccion,
      camposDudosos,
      requiereRevision: camposDudosos.some((campos) => campos.length > 0),
      umbralConfianza: UMBRAL_CONFIANZA,
    };
  }
}

export interface UnidadCorregida {
  tipo?: string;
  vin?: string | null;
  anio?: number | null;
  marca?: string | null;
  modelo?: string | null;
  descripcion?: string | null;
  tipoCarga?: string | null;
  valorAsegurado?: number | null;
}
