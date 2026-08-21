import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
      include: { flota: { select: { id: true, nombre: true } } },
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

  /** Borra una unidad por completo. Se bloquea si tiene pólizas (datos financieros). */
  async eliminar(id: string, actorUserId?: string) {
    const existe = await this.prisma.unidad.findUnique({ where: { id } });
    if (!existe) throw new NotFoundException('Unidad no encontrada');

    const polizas = await this.prisma.poliza.count({ where: { unidadId: id } });
    if (polizas > 0) {
      throw new BadRequestException(
        'La unidad tiene pólizas registradas; no se puede eliminar.',
      );
    }

    await this.prisma.unidad.delete({ where: { id } });
    await this.audit.registrar({
      entidad: 'Unidad',
      entidadId: id,
      accion: 'eliminar',
      actorUserId,
    });
    return { ok: true };
  }
}
