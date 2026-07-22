import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EstadoExpediente, Prisma, Rol } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { ComparativoService } from './comparativo.service';
import { transicionesValidas } from './transiciones';
import { CrearExpedienteDto, PropuestaAseguradoraDto } from './dto/expediente.dto';

@Injectable()
export class ExpedientesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notificaciones: NotificacionesService,
    private readonly comparativo: ComparativoService,
  ) {}

  listar(estado?: EstadoExpediente) {
    return this.prisma.expediente.findMany({
      where: estado ? { estado } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        cliente: { select: { id: true, razonSocial: true } },
        _count: { select: { propuestasAseguradora: true, comparativos: true } },
      },
    });
  }

  async obtener(id: string) {
    const expediente = await this.prisma.expediente.findUnique({
      where: { id },
      include: {
        cliente: { select: { id: true, razonSocial: true, whatsappNumber: true } },
        propuestasAseguradora: {
          include: { aseguradora: true },
          orderBy: { createdAt: 'asc' },
        },
        comparativos: { orderBy: { generadoEn: 'desc' } },
        propuestaCliente: true,
        comentarios: {
          include: { autor: { select: { id: true, nombre: true, rol: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!expediente) throw new NotFoundException('Expediente no encontrado');

    // Qué aseguradoras faltan por capturar: es lo que dispara el comparativo.
    const capturadas = expediente.propuestasAseguradora.map((p) => p.aseguradoraId);
    const pendientes = expediente.aseguradorasSolicitadas.filter((a) => !capturadas.includes(a));

    return { ...expediente, aseguradorasPendientes: pendientes };
  }

  async crear(dto: CrearExpedienteDto, actorUserId: string) {
    const cliente = await this.prisma.cliente.findUnique({ where: { id: dto.clienteId } });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');

    const expediente = await this.prisma.expediente.create({
      data: {
        clienteId: dto.clienteId,
        siniestralidad: dto.siniestralidad,
        aseguradorasSolicitadas: dto.aseguradorasSolicitadas,
        createdById: actorUserId,
        estado: EstadoExpediente.en_captura,
      },
    });

    await this.audit.registrar({
      entidad: 'Expediente',
      entidadId: expediente.id,
      accion: 'create',
      actorUserId,
      diff: dto as unknown as Prisma.InputJsonValue,
    });
    return expediente;
  }

  /** Actualiza la siniestralidad y/o las aseguradoras a las que se pidió propuesta. */
  async actualizar(
    id: string,
    dto: { siniestralidad?: string; aseguradorasSolicitadas?: string[] },
    actorUserId: string,
  ) {
    await this.obtener(id);
    const expediente = await this.prisma.expediente.update({ where: { id }, data: dto });
    await this.audit.registrar({
      entidad: 'Expediente',
      entidadId: id,
      accion: 'update',
      actorUserId,
      diff: dto as unknown as Prisma.InputJsonValue,
    });
    return expediente;
  }

  /**
   * Captura estructurada de la propuesta que regresó una aseguradora.
   * Si con ésta se completan todas las solicitadas, el comparativo se genera solo.
   */
  async capturarPropuesta(
    expedienteId: string,
    dto: PropuestaAseguradoraDto,
    actorUserId: string,
  ) {
    const expediente = await this.obtener(expedienteId);

    const aseguradora = await this.prisma.aseguradora.findUnique({
      where: { id: dto.aseguradoraId },
    });
    if (!aseguradora) throw new NotFoundException('Aseguradora no encontrada');

    const propuesta = await this.prisma.propuestaAseguradora.upsert({
      where: {
        expedienteId_aseguradoraId: {
          expedienteId,
          aseguradoraId: dto.aseguradoraId,
        },
      },
      create: {
        expedienteId,
        aseguradoraId: dto.aseguradoraId,
        coberturas: dto.coberturas as unknown as Prisma.InputJsonValue,
        deducibles: dto.deducibles as unknown as Prisma.InputJsonValue,
        prima: dto.prima as unknown as Prisma.Decimal,
        condiciones: dto.condiciones,
      },
      update: {
        coberturas: dto.coberturas as unknown as Prisma.InputJsonValue,
        deducibles: dto.deducibles as unknown as Prisma.InputJsonValue,
        prima: dto.prima as unknown as Prisma.Decimal,
        condiciones: dto.condiciones,
      },
    });

    // La primera captura mueve el expediente a análisis técnico.
    if (expediente.estado === EstadoExpediente.en_captura) {
      await this.prisma.expediente.update({
        where: { id: expedienteId },
        data: { estado: EstadoExpediente.en_analisis_tecnico },
      });
    }

    await this.audit.registrar({
      entidad: 'PropuestaAseguradora',
      entidadId: propuesta.id,
      accion: 'capturar',
      actorUserId,
      diff: { expedienteId, aseguradora: aseguradora.nombre },
    });

    // Disparo automático: si ya están todas, genera comparativo y notifica.
    const comparativo = await this.comparativo.generarSiEstaCompleto(expedienteId, actorUserId);

    return { propuesta, comparativoGenerado: comparativo !== null, comparativo };
  }

  /** Cambio de estado validado contra la máquina de transiciones. */
  async cambiarEstado(id: string, nuevo: EstadoExpediente, actorUserId: string) {
    const expediente = await this.obtener(id);
    const permitidas = transicionesValidas(expediente.estado);

    if (!permitidas.includes(nuevo)) {
      throw new BadRequestException(
        `No se puede pasar de "${expediente.estado}" a "${nuevo}". Transiciones válidas: ${
          permitidas.join(', ') || 'ninguna'
        }`,
      );
    }

    const actualizado = await this.prisma.expediente.update({
      where: { id },
      data: { estado: nuevo },
    });

    // Avisar al siguiente responsable sin que nadie tenga que perseguirlo.
    if (nuevo === EstadoExpediente.ajustado) {
      await this.notificaciones.notificarRol({
        rol: Rol.tecnico,
        titulo: 'Expediente devuelto para ajuste',
        mensaje: `El área comercial solicitó ajustes en el expediente ${expediente.folioInterno} (${expediente.cliente.razonSocial}).`,
        enlace: `/expedientes/${id}`,
        expedienteId: id,
      });
    }
    if (nuevo === EstadoExpediente.aprobado) {
      await this.notificaciones.notificarRol({
        rol: Rol.administracion,
        titulo: 'Expediente aprobado — generar propuesta',
        mensaje: `El expediente ${expediente.folioInterno} (${expediente.cliente.razonSocial}) fue aprobado y está listo para generar la propuesta al cliente.`,
        enlace: `/expedientes/${id}`,
        expedienteId: id,
      });
    }

    await this.audit.registrar({
      entidad: 'Expediente',
      entidadId: id,
      accion: `estado:${nuevo}`,
      actorUserId,
      diff: { anterior: expediente.estado, nuevo },
    });

    return actualizado;
  }

  /** Comentarios y ajustes del director comercial, dentro del sistema. */
  async comentar(expedienteId: string, contenido: string, actorUserId: string) {
    await this.obtener(expedienteId);
    const comentario = await this.prisma.comentario.create({
      data: { expedienteId, autorId: actorUserId, contenido },
      include: { autor: { select: { id: true, nombre: true, rol: true } } },
    });
    await this.audit.registrar({
      entidad: 'Expediente',
      entidadId: expedienteId,
      accion: 'comentar',
      actorUserId,
    });
    return comentario;
  }

  auditoria(expedienteId: string) {
    return this.audit.historial('Expediente', expedienteId);
  }
}
