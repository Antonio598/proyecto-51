import { Injectable } from '@nestjs/common';
import { Rol } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificacionesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Notifica a todos los usuarios activos de un rol (p. ej. al comercial). */
  async notificarRol(params: {
    rol: Rol;
    titulo: string;
    mensaje: string;
    enlace?: string;
    expedienteId?: string;
  }) {
    return this.prisma.notificacion.create({
      data: {
        rolDestino: params.rol,
        titulo: params.titulo,
        mensaje: params.mensaje,
        enlace: params.enlace,
        expedienteId: params.expedienteId,
      },
    });
  }

  /** Bandeja del usuario: sus notificaciones directas + las dirigidas a su rol. */
  listar(usuarioId: string, rol: Rol, soloNoLeidas = false) {
    return this.prisma.notificacion.findMany({
      where: {
        OR: [{ usuarioId }, { rolDestino: rol as Rol }],
        ...(soloNoLeidas ? { leida: false } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async marcarLeida(id: string) {
    return this.prisma.notificacion.update({ where: { id }, data: { leida: true } });
  }

  async contarNoLeidas(usuarioId: string, rol: Rol) {
    return this.prisma.notificacion.count({
      where: { leida: false, OR: [{ usuarioId }, { rolDestino: rol as Rol }] },
    });
  }
}
