import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EstadoCobranza, OrigenDocumento, Rol, TipoDocumento } from '@prisma/client';
import AdmZip from 'adm-zip';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { ConciliacionService } from '../pagos/conciliacion.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

/** Extensiones de contenido que el portal acepta (dentro o fuera de un ZIP). */
const EXTENSIONES_OK = ['xlsx', 'xls', 'csv', 'pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif'];
/** Tamaño máximo por archivo de contenido (15 MB). */
const TAM_MAX = 15 * 1024 * 1024;
/** Tamaño máximo por archivo entrante, incluido un ZIP (30 MB). */
const TAM_MAX_ENTRANTE = 30 * 1024 * 1024;
/** Tope de archivos ya expandidos por envío. */
const MAX_ARCHIVOS = 200;

/** MIME por extensión, para reconstruir el tipo de los archivos sacados de un ZIP. */
const MIME_POR_EXT: Record<string, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

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
    // Validar lo entrante (permite ZIP además del allowlist de contenido).
    for (const a of datos.archivos) {
      this.validarEntrante(a);
    }
    // Expandir carpetas comprimidas: un ZIP se convierte en sus archivos internos.
    const archivos = this.expandirArchivos(datos.archivos);
    if (archivos.length === 0) {
      throw new BadRequestException('No encontramos archivos válidos en lo que subiste.');
    }
    if (archivos.length > MAX_ARCHIVOS) {
      throw new BadRequestException(`Demasiados archivos en un envío (máximo ${MAX_ARCHIVOS}).`);
    }
    for (const a of archivos) {
      this.validarArchivo(a);
    }

    const numero = WhatsappService.normalizarNumero(datos.telefono);
    if (numero.replace(/\D/g, '').length < 10) {
      throw new BadRequestException('El teléfono no parece válido.');
    }

    // 1. Buscar el cliente por teléfono; si no existe, crearlo.
    const { cliente, creado } = await this.buscarOCrearCliente(numero, datos.email, datos.nombre);

    // 2. Guardar cada archivo en el almacén.
    const guardados: Array<{ storageKey: string; nombre: string; mime: string }> = [];
    for (const archivo of archivos) {
      const storageKey = await this.storage.subir(
        `clientes/${cliente.id}/recibidos`,
        archivo.nombre,
        archivo.buffer,
        archivo.mime,
      );
      guardados.push({ storageKey, nombre: archivo.nombre, mime: archivo.mime });
    }

    // 3. Registrar TODO el envío como UN solo documento en la bandeja. Los
    //    archivos individuales quedan en metadata.archivos para extraerlos juntos.
    const unSolo = guardados.length === 1;
    const documento = await this.prisma.documento.create({
      data: {
        clienteId: cliente.id,
        tipo: TipoDocumento.recibido,
        origen: OrigenDocumento.portal,
        storageKey: guardados[0].storageKey,
        mime: unSolo ? guardados[0].mime : 'multipart/paquete',
        nombreOriginal: unSolo ? guardados[0].nombre : `Paquete de ${guardados.length} archivos`,
        procesado: false,
        metadata: {
          telefono: numero,
          email: datos.email,
          nombre: datos.nombre ?? null,
          archivos: guardados,
          totalArchivos: guardados.length,
        },
      },
    });

    // 4. Avisar al equipo de captura.
    await this.notificaciones.notificarRol({
      rol: Rol.captura,
      titulo: 'Documentos recibidos por el portal',
      mensaje:
        `${cliente.razonSocial} (${numero}) subió ${guardados.length} archivo(s) por el portal` +
        (creado ? ' — cliente nuevo, revisar sus datos.' : '.'),
      enlace: '/documentos',
    });

    // 5. Si es un cliente existente con cobros abiertos, intentar conciliar
    //    (por si el envío incluye un comprobante de pago).
    if (!creado) {
      void this.conciliarSiProcede(cliente.id, documento.id);
    }

    this.logger.log(
      `Portal: 1 documento con ${guardados.length} archivo(s) de ${numero}` +
        (creado ? ' (cliente creado)' : ` (${cliente.razonSocial})`),
    );

    return { recibidos: guardados.length, clienteNuevo: creado };
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
            facturas: { orderBy: { createdAt: 'desc' } },
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

    // Documentos descargables: carátulas de póliza (pdfDocId), facturas y
    // estados de cuenta (desgloses). Resolvemos storageKey → URL firmada.
    const facturasRaw = cliente.polizas.flatMap((p) =>
      p.facturas.map((f) => ({
        tipo: f.tipo,
        fecha: f.createdAt,
        aseguradora: p.aseguradora.nombre,
        storageDocId: f.storageDocId,
      })),
    );
    const desgloses = await this.prisma.documento.findMany({
      where: { clienteId: cliente.id, tipo: TipoDocumento.desglose },
      orderBy: { createdAt: 'desc' },
    });

    const idsDoc = [
      ...cliente.polizas.map((p) => p.pdfDocId),
      ...facturasRaw.map((f) => f.storageDocId),
    ].filter((v): v is string => !!v);
    const docs = idsDoc.length
      ? await this.prisma.documento.findMany({ where: { id: { in: idsDoc } } })
      : [];
    const keyPorDoc = new Map(docs.map((d) => [d.id, d.storageKey]));

    const firmar = async (storageKey?: string | null) => {
      if (!storageKey) return null;
      try {
        return await this.storage.urlFirmada(storageKey);
      } catch {
        return null;
      }
    };

    const [polizas, facturas, estadosCuenta] = await Promise.all([
      Promise.all(
        cliente.polizas.map(async (p) => ({
          id: p.id,
          folio: p.folio,
          estado: p.estado,
          vigenciaInicio: p.vigenciaInicio,
          vigenciaFin: p.vigenciaFin,
          aseguradora: p.aseguradora.nombre,
          unidad: [p.unidad.marca, p.unidad.modelo].filter(Boolean).join(' ') || p.unidad.vin,
          urlNube: p.urlNube ?? null,
          pdfUrl: await firmar(p.pdfDocId ? keyPorDoc.get(p.pdfDocId) : null),
        })),
      ),
      Promise.all(
        facturasRaw
          .filter((f) => f.storageDocId)
          .map(async (f) => ({
            tipo: f.tipo,
            fecha: f.fecha,
            aseguradora: f.aseguradora,
            url: await firmar(keyPorDoc.get(f.storageDocId!)),
          })),
      ),
      Promise.all(
        desgloses.map(async (d) => ({
          nombre: d.nombreOriginal ?? 'Desglose de costos',
          fecha: d.createdAt,
          url: await firmar(d.storageKey),
        })),
      ),
    ]);

    return {
      cliente: {
        razonSocial: cliente.razonSocial,
        contactoNombre: cliente.contactoNombre,
        contactoEmail: cliente.contactoEmail,
        telefono: cliente.whatsappNumber,
      },
      unidades: cliente.unidades,
      polizas,
      cobranza,
      facturas: facturas.filter((f) => f.url),
      estadosCuenta: estadosCuenta.filter((e) => e.url),
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

  /** Valida un archivo de contenido ya expandido (allowlist + 15 MB). */
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

  /** Valida un archivo tal como llega (acepta también ZIP, hasta 30 MB). */
  private validarEntrante(a: ArchivoSubido) {
    const ext = (a.nombre.split('.').pop() ?? '').toLowerCase();
    if (ext !== 'zip' && !EXTENSIONES_OK.includes(ext)) {
      throw new BadRequestException(
        `Tipo de archivo no permitido: .${ext}. Acepta: ${EXTENSIONES_OK.join(', ')} o .zip.`,
      );
    }
    if (a.buffer.length > TAM_MAX_ENTRANTE) {
      throw new BadRequestException(`"${a.nombre}" supera el tamaño máximo de 30 MB.`);
    }
  }

  private esZip(a: ArchivoSubido): boolean {
    return (
      /\.zip$/i.test(a.nombre) ||
      a.mime === 'application/zip' ||
      a.mime === 'application/x-zip-compressed'
    );
  }

  /** Expande los ZIP a sus archivos internos; el resto pasa tal cual. */
  private expandirArchivos(entrantes: ArchivoSubido[]): ArchivoSubido[] {
    const salida: ArchivoSubido[] = [];
    for (const a of entrantes) {
      if (!this.esZip(a)) {
        salida.push(a);
        continue;
      }
      let entradas: AdmZip.IZipEntry[];
      try {
        entradas = new AdmZip(a.buffer).getEntries();
      } catch {
        throw new BadRequestException(`No se pudo abrir el ZIP "${a.nombre}".`);
      }
      for (const entrada of entradas) {
        if (entrada.isDirectory) continue;
        const nombre = entrada.entryName.split('/').pop() ?? entrada.entryName;
        // Ignora archivos ocultos y metadatos de macOS.
        if (!nombre || nombre.startsWith('.') || entrada.entryName.startsWith('__MACOSX')) continue;
        const ext = (nombre.split('.').pop() ?? '').toLowerCase();
        if (!EXTENSIONES_OK.includes(ext)) continue; // se ignora lo no soportado dentro del ZIP
        salida.push({
          buffer: entrada.getData(),
          nombre,
          mime: MIME_POR_EXT[ext] ?? 'application/octet-stream',
        });
      }
    }
    return salida;
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
