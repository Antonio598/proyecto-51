import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateUnidadDto, UpdateUnidadDto } from './dto/unidad.dto';

@Injectable()
export class UnidadesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async assertCliente(clienteId: string) {
    const c = await this.prisma.cliente.findUnique({ where: { id: clienteId } });
    if (!c) throw new NotFoundException('Cliente no encontrado');
  }

  async listar(clienteId: string) {
    await this.assertCliente(clienteId);
    return this.prisma.unidad.findMany({
      where: { clienteId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async crear(clienteId: string, dto: CreateUnidadDto, actorUserId?: string) {
    await this.assertCliente(clienteId);
    const unidad = await this.prisma.unidad.create({
      data: {
        clienteId,
        ...dto,
        valorAsegurado: dto.valorAsegurado as unknown as Prisma.Decimal,
        camposExtra: dto.camposExtra as Prisma.InputJsonValue,
      },
    });
    await this.audit.registrar({
      entidad: 'Unidad',
      entidadId: unidad.id,
      accion: 'create',
      actorUserId,
      diff: { clienteId, ...dto },
    });
    return unidad;
  }

  async actualizar(id: string, dto: UpdateUnidadDto, actorUserId?: string) {
    const existe = await this.prisma.unidad.findUnique({ where: { id } });
    if (!existe) throw new NotFoundException('Unidad no encontrada');
    const unidad = await this.prisma.unidad.update({
      where: { id },
      data: {
        ...dto,
        valorAsegurado: dto.valorAsegurado as unknown as Prisma.Decimal,
        camposExtra: dto.camposExtra as Prisma.InputJsonValue,
      },
    });
    await this.audit.registrar({
      entidad: 'Unidad',
      entidadId: id,
      accion: 'update',
      actorUserId,
      diff: dto,
    });
    return unidad;
  }

  async eliminar(id: string, actorUserId?: string) {
    const existe = await this.prisma.unidad.findUnique({ where: { id } });
    if (!existe) throw new NotFoundException('Unidad no encontrada');
    await this.prisma.unidad.update({ where: { id }, data: { activo: false } });
    await this.audit.registrar({
      entidad: 'Unidad',
      entidadId: id,
      accion: 'desactivar',
      actorUserId,
    });
    return { ok: true };
  }
}
