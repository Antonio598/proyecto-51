import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Servicio central de auditoría. Los servicios de dominio lo invocan
 * tras crear/actualizar/eliminar para dejar rastro de quién y cuándo.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async registrar(params: {
    entidad: string;
    entidadId: string;
    accion: string;
    actorUserId?: string | null;
    diff?: unknown;
  }) {
    await this.prisma.auditLog.create({
      data: {
        entidad: params.entidad,
        entidadId: params.entidadId,
        accion: params.accion,
        actorUserId: params.actorUserId ?? null,
        diff: (params.diff ?? undefined) as any,
      },
    });
  }

  /** Consulta el historial de una entidad concreta (más reciente primero). */
  historial(entidad: string, entidadId: string) {
    return this.prisma.auditLog.findMany({
      where: { entidad, entidadId },
      orderBy: { timestamp: 'desc' },
      include: { actor: { select: { id: true, nombre: true, rol: true } } },
    });
  }
}
