import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  EstadoExpediente,
  EstadoRevision,
  OrigenDocumento,
  Prisma,
  TipoDocumento,
  TipoUnidad,
} from '@prisma/client';
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

  /**
   * Bandeja: documentos por procesar, tanto los recibidos por WhatsApp como
   * los subidos manualmente por el equipo. Los generados por el sistema
   * (comparativos, propuestas…) no aparecen aquí.
   */
  bandeja() {
    return this.prisma.documento.findMany({
      where: {
        origen: {
          in: [
            OrigenDocumento.whatsapp,
            OrigenDocumento.manual_upload,
            OrigenDocumento.portal,
          ],
        },
        procesado: false,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        cliente: { select: { id: true, razonSocial: true } },
        extraccion: { select: { id: true, estadoRevision: true } },
      },
    });
  }

  /**
   * Subida manual de un documento (p. ej. un archivo que llegó por correo).
   * Cae en la misma bandeja y sigue el mismo flujo de extracción y revisión.
   */
  async subirManual(
    archivo: { buffer: Buffer; nombre: string; mime: string },
    clienteId: string | undefined,
    actorUserId: string,
  ) {
    if (clienteId) {
      const cliente = await this.prisma.cliente.findUnique({ where: { id: clienteId } });
      if (!cliente) throw new NotFoundException('Cliente no encontrado');
    }

    const carpeta = clienteId ? `clientes/${clienteId}/recibidos` : 'sin-asignar';
    const storageKey = await this.storage.subir(
      carpeta,
      archivo.nombre,
      archivo.buffer,
      archivo.mime,
    );

    const documento = await this.prisma.documento.create({
      data: {
        clienteId: clienteId ?? null,
        tipo: TipoDocumento.recibido,
        origen: OrigenDocumento.manual_upload,
        storageKey,
        mime: archivo.mime,
        nombreOriginal: archivo.nombre,
        procesado: false,
        metadata: { subidoPor: actorUserId },
      },
    });

    await this.audit.registrar({
      entidad: 'Documento',
      entidadId: documento.id,
      accion: 'subir_manual',
      actorUserId,
      diff: { clienteId: clienteId ?? null, nombre: archivo.nombre },
    });

    this.logger.log(`Documento ${documento.id} subido manualmente por ${actorUserId}`);
    return documento;
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
   * Documentos recibidos vinculados a un cliente. Aunque ya se hayan procesado
   * (aprobados), no se borran: aquí se ven con sus archivos originales y a qué
   * cliente pertenecen.
   */
  async documentosDeCliente(clienteId: string) {
    const docs = await this.prisma.documento.findMany({
      where: {
        clienteId,
        origen: {
          in: [OrigenDocumento.whatsapp, OrigenDocumento.portal, OrigenDocumento.manual_upload],
        },
      },
      orderBy: { createdAt: 'desc' },
      include: { extraccion: { select: { estadoRevision: true } } },
    });
    return docs.map((d) => {
      const archivos = this.archivosDe(d).map((a, i) => ({ indice: i, nombre: a.nombre, mime: a.mime }));
      return {
        id: d.id,
        nombreOriginal: d.nombreOriginal,
        origen: d.origen,
        procesado: d.procesado,
        createdAt: d.createdAt,
        estadoRevision: d.extraccion?.estadoRevision ?? null,
        totalArchivos: archivos.length,
        archivos,
      };
    });
  }

  /** URL firmada de un archivo concreto dentro de un documento (paquete). */
  async enlaceArchivo(documentoId: string, indice: number) {
    const documento = await this.obtener(documentoId);
    const archivos = this.archivosDe(documento);
    const archivo = archivos[indice];
    if (!archivo) throw new NotFoundException('Archivo no encontrado');
    return { url: await this.storage.urlFirmada(archivo.storageKey), nombre: archivo.nombre };
  }

  /**
   * Dispara la extracción. Como puede haber muchos archivos (carpeta/ZIP) y cada
   * uno es una llamada a la IA, el trabajo corre EN SEGUNDO PLANO: se marca la
   * extracción como "procesando", se devuelve de inmediato y la pantalla de
   * revisión consulta el avance. Así la petición HTTP no se queda colgada minutos
   * (lo que el proxy cortaba como error 500/502).
   */
  async extraer(documentoId: string, actorUserId?: string) {
    const documento = await this.obtener(documentoId);
    const archivos = this.archivosDe(documento);

    const extraccion = await this.prisma.extraccion.upsert({
      where: { documentoId },
      create: {
        documentoId,
        camposExtraidos: {
          unidades: [],
          notas: '',
          procesando: true,
          totalArchivos: archivos.length,
        } as Prisma.InputJsonValue,
        confianzaPorCampo: { unidades: [] } as Prisma.InputJsonValue,
        modeloUsado: '',
        estadoRevision: EstadoRevision.pendiente,
      },
      update: {
        camposExtraidos: {
          unidades: [],
          notas: '',
          procesando: true,
          totalArchivos: archivos.length,
        } as Prisma.InputJsonValue,
        confianzaPorCampo: { unidades: [] } as Prisma.InputJsonValue,
        modeloUsado: '',
        estadoRevision: EstadoRevision.pendiente,
        revisadoPorId: null,
        revisadoEn: null,
      },
    });

    // No se espera: el procesamiento sigue en segundo plano.
    void this.procesarExtraccion(documentoId, archivos, actorUserId);

    return this.conBanderas(extraccion);
  }

  /**
   * Procesa todos los archivos del documento (una llamada a la IA por archivo)
   * y guarda el resultado. Corre en segundo plano; nunca lanza: los errores se
   * anotan en la extracción para que la pantalla los muestre.
   */
  private async procesarExtraccion(
    documentoId: string,
    archivos: Array<{ storageKey: string; nombre: string; mime: string }>,
    actorUserId?: string,
  ) {
    const unidades: UnidadExtraida[] = [];
    const notas: string[] = [];
    const fallidos: string[] = [];
    // JSON crudo por archivo (clasificación, sumas separadas, evidencia, conflictos).
    const documentosCrudos: Array<{ archivo: string; tipoDocumento: string; datos: unknown }> = [];
    let modeloUsado = '';
    // Datos fiscales del cliente: se toma el primer RFC/razón social que aparezca
    // en cualquiera de los archivos del envío (es el mismo contratante).
    let clienteRfc = '';
    let clienteRazonSocial = '';

    for (const archivo of archivos) {
      // Cada archivo se procesa por separado: si uno falla (foto muy pesada,
      // PDF que el modelo rechaza, archivo ilegible), se anota y se sigue con
      // el resto en vez de tumbar toda la extracción.
      try {
        const contenido = await this.storage.descargar(archivo.storageKey);
        const resultado = await this.claude.extraerUnidades(contenido, archivo.mime, archivo.nombre);
        modeloUsado = resultado.modeloUsado;
        documentosCrudos.push({
          archivo: archivo.nombre,
          tipoDocumento: resultado.tipoDocumento,
          datos: resultado.crudo,
        });
        if (!clienteRfc && resultado.cliente?.rfc?.trim()) clienteRfc = resultado.cliente.rfc.trim();
        if (!clienteRazonSocial && resultado.cliente?.razonSocial?.trim()) {
          clienteRazonSocial = resultado.cliente.razonSocial.trim();
        }
        const flotaPorArchivo = this.baseNombre(archivo.nombre);
        for (const u of resultado.unidades) {
          unidades.push({ ...u, flotaNombre: u.flotaNombre?.trim() || flotaPorArchivo });
        }
        if (resultado.notas?.trim()) {
          notas.push(
            archivos.length > 1 ? `[${archivo.nombre}] ${resultado.notas}` : resultado.notas,
          );
        }
      } catch (err) {
        const motivo = err instanceof Error ? err.message : 'error desconocido';
        this.logger.warn(`No se pudo extraer "${archivo.nombre}": ${motivo}`);
        fallidos.push(archivo.nombre);
        notas.push(`No se pudo procesar "${archivo.nombre}": ${motivo}`);
      }
    }

    try {
      const camposExtraidos = {
        unidades: unidades.map((u) => this.sinConfianza(u)),
        cliente: { rfc: clienteRfc, razonSocial: clienteRazonSocial },
        notas: notas.join('\n'),
        documentos: documentosCrudos,
        procesando: false,
        totalArchivos: archivos.length,
        fallidos: fallidos.length,
      };
      const confianzaPorCampo = { unidades: unidades.map((u) => u.confianza ?? {}) };

      await this.prisma.extraccion.update({
        where: { documentoId },
        data: {
          camposExtraidos: camposExtraidos as Prisma.InputJsonValue,
          confianzaPorCampo: confianzaPorCampo as Prisma.InputJsonValue,
          modeloUsado,
          estadoRevision: EstadoRevision.pendiente,
        },
      });

      await this.audit.registrar({
        entidad: 'Extraccion',
        entidadId: documentoId,
        accion: 'extraer',
        actorUserId,
        diff: { documentoId, archivos: archivos.length, unidades: unidades.length, fallidos: fallidos.length },
      });

      this.logger.log(
        `Extracción del documento ${documentoId}: ${unidades.length} unidades de ${archivos.length} archivo(s) (${fallidos.length} con error)`,
      );
    } catch (err) {
      const motivo = err instanceof Error ? err.message : 'error desconocido';
      this.logger.error(`Falló al guardar la extracción de ${documentoId}: ${motivo}`);
      await this.prisma.extraccion
        .update({
          where: { documentoId },
          data: {
            camposExtraidos: {
              unidades: [],
              notas: `La extracción falló: ${motivo}`,
              procesando: false,
              error: true,
            } as Prisma.InputJsonValue,
          },
        })
        .catch(() => undefined);
    }
  }

  /**
   * Archivos que componen un documento. Los envíos del portal (carpeta/ZIP)
   * guardan la lista en metadata.archivos; el resto es un solo archivo.
   */
  private archivosDe(documento: {
    storageKey: string;
    mime: string | null;
    nombreOriginal: string | null;
    metadata: Prisma.JsonValue;
  }): Array<{ storageKey: string; nombre: string; mime: string }> {
    const meta = documento.metadata as { archivos?: Array<{ storageKey: string; nombre: string; mime: string }> } | null;
    if (Array.isArray(meta?.archivos) && meta.archivos.length > 0) {
      return meta.archivos;
    }
    return [
      {
        storageKey: documento.storageKey,
        nombre: documento.nombreOriginal ?? 'documento',
        mime: documento.mime ?? 'application/octet-stream',
      },
    ];
  }

  /** Nombre base de un archivo (sin ruta ni extensión), para usarlo como nombre de flota. */
  private baseNombre(nombre: string): string {
    const soloArchivo = nombre.split(/[\\/]/).pop() ?? nombre;
    return soloArchivo.replace(/\.[^.]+$/, '') || soloArchivo;
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
    datosCliente?: { rfc?: string; razonSocial?: string },
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

    const resumen = await this.prisma.$transaction(async (tx) => {
      // Datos fiscales del cliente: guardar el RFC extraído/corregido, y completar
      // la razón social si el cliente aún tiene un nombre provisional (portal).
      const rfc = datosCliente?.rfc?.trim();
      const razonSocial = datosCliente?.razonSocial?.trim();
      if (rfc || razonSocial) {
        const cli = await tx.cliente.findUnique({
          where: { id: clienteId },
          select: { razonSocial: true },
        });
        const esProvisional = /^cliente portal/i.test(cli?.razonSocial ?? '');
        const dataCliente: { rfc?: string; razonSocial?: string } = {};
        if (rfc) dataCliente.rfc = rfc;
        if (razonSocial && esProvisional) dataCliente.razonSocial = razonSocial;
        if (Object.keys(dataCliente).length > 0) {
          await tx.cliente.update({ where: { id: clienteId }, data: dataCliente });
        }
      }

      const unidades = [];
      // Caché de flotas por nombre para no crear duplicados dentro del mismo envío.
      const flotasPorNombre = new Map<string, string>();
      let creadas = 0;
      let actualizadas = 0;

      for (const u of unidadesCorregidas) {
        // 1. Resolver la flota (crear si es nueva para este cliente).
        const flotaId = await this.resolverFlota(tx, clienteId, u.flotaNombre, flotasPorNombre);

        // 2. Datos de la unidad.
        const datos = {
          flotaId,
          folio: u.folio ?? null,
          tipo: (u.tipo as TipoUnidad) ?? TipoUnidad.otro,
          aseguradoNombre: u.aseguradoNombre ?? null,
          vin: u.vin ?? null,
          anio: u.anio ?? null,
          marca: u.marca ?? null,
          modelo: u.modelo ?? null,
          descripcion: u.descripcion ?? null,
          numeroEconomico: u.numeroEconomico ?? null,
          placas: u.placas ?? null,
          numeroMotor: u.numeroMotor ?? null,
          tipoCarga: u.tipoCarga ?? null,
          usoUnidad: u.usoUnidad ?? null,
          tipoCobertura: u.tipoCobertura ?? null,
          dobleRemolque: u.dobleRemolque ?? false,
          valorAsegurado: u.valorAsegurado ?? null,
          tipoAdaptacion: u.tipoAdaptacion ?? null,
          coberturaAdaptacion: u.coberturaAdaptacion ?? null,
          sumaAseguradaAdaptacion: u.sumaAseguradaAdaptacion ?? null,
        };

        // 3. Si la unidad ya existe (mismo VIN, económico o folio), actualizarla.
        const existente = await this.buscarUnidadExistente(tx, clienteId, u);
        if (existente) {
          unidades.push(
            await tx.unidad.update({ where: { id: existente.id }, data: { ...datos, activo: true } }),
          );
          actualizadas++;
        } else {
          unidades.push(
            await tx.unidad.create({
              data: {
                clienteId,
                ...datos,
                camposExtra: { origenDocumentoId: documentoId } as Prisma.InputJsonValue,
              },
            }),
          );
          creadas++;
        }
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

      // Al completar la extracción de un cliente, se crea su expediente en
      // estado "vacío" (si aún no tiene ninguno), listo para empezar a trabajar.
      let expedienteCreado = false;
      const tieneExpediente = await tx.expediente.count({ where: { clienteId } });
      if (tieneExpediente === 0) {
        await tx.expediente.create({
          data: { clienteId, estado: EstadoExpediente.vacio, createdById: actorUserId },
        });
        expedienteCreado = true;
      }

      return { unidades, creadas, actualizadas, expedienteCreado };
    });

    await this.audit.registrar({
      entidad: 'Documento',
      entidadId: documentoId,
      accion: 'aprobar_extraccion',
      actorUserId,
      diff: {
        clienteId,
        unidadesCreadas: resumen.creadas,
        unidadesActualizadas: resumen.actualizadas,
      },
    });

    return {
      unidadesCreadas: resumen.creadas,
      unidadesActualizadas: resumen.actualizadas,
      expedienteCreado: resumen.expedienteCreado,
      unidades: resumen.unidades,
    };
  }

  /**
   * Devuelve el id de la flota del cliente con ese nombre, creándola si no existe.
   * Si el nombre viene vacío, la unidad queda sin flota.
   */
  private async resolverFlota(
    tx: Prisma.TransactionClient,
    clienteId: string,
    flotaNombre: string | null | undefined,
    cache: Map<string, string>,
  ): Promise<string | null> {
    const nombre = (flotaNombre ?? '').trim();
    if (!nombre) return null;
    if (cache.has(nombre)) return cache.get(nombre)!;

    const existente = await tx.flota.findFirst({ where: { clienteId, nombre } });
    const flota = existente ?? (await tx.flota.create({ data: { clienteId, nombre } }));
    cache.set(nombre, flota.id);
    return flota.id;
  }

  /** Busca una unidad del cliente que coincida por VIN, número económico o folio. */
  private async buscarUnidadExistente(
    tx: Prisma.TransactionClient,
    clienteId: string,
    u: UnidadCorregida,
  ) {
    const ors: Prisma.UnidadWhereInput[] = [];
    if (u.vin?.trim()) ors.push({ vin: u.vin.trim() });
    if (u.numeroEconomico?.trim()) ors.push({ numeroEconomico: u.numeroEconomico.trim() });
    if (u.folio?.trim()) ors.push({ folio: u.folio.trim() });
    if (ors.length === 0) return null;
    return tx.unidad.findFirst({ where: { clienteId, OR: ors } });
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
  flotaNombre?: string | null;
  folio?: string | null;
  tipo?: string;
  aseguradoNombre?: string | null;
  vin?: string | null;
  anio?: number | null;
  marca?: string | null;
  modelo?: string | null;
  descripcion?: string | null;
  numeroEconomico?: string | null;
  placas?: string | null;
  numeroMotor?: string | null;
  tipoCarga?: string | null;
  usoUnidad?: string | null;
  tipoCobertura?: string | null;
  dobleRemolque?: boolean;
  valorAsegurado?: number | null;
  tipoAdaptacion?: string | null;
  coberturaAdaptacion?: string | null;
  sumaAseguradaAdaptacion?: number | null;
}
