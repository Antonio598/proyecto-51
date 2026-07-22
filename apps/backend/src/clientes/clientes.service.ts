import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateClienteDto, UpdateClienteDto } from './dto/cliente.dto';

@Injectable()
export class ClientesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listar(buscar?: string) {
    return this.prisma.cliente.findMany({
      where: buscar
        ? {
            OR: [
              { razonSocial: { contains: buscar, mode: 'insensitive' } },
              { rfc: { contains: buscar, mode: 'insensitive' } },
              { whatsappNumber: { contains: buscar } },
            ],
          }
        : undefined,
      orderBy: { razonSocial: 'asc' },
      include: { _count: { select: { unidades: true, polizas: true } } },
    });
  }

  async obtener(id: string) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id },
      include: {
        unidades: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');
    return cliente;
  }

  /** Historial de aseguramiento: qué unidades han estado aseguradas, con quién y en qué periodo. */
  async historialAseguramiento(id: string) {
    await this.obtener(id);
    return this.prisma.poliza.findMany({
      where: { clienteId: id },
      orderBy: { vigenciaInicio: 'desc' },
      include: {
        unidad: { select: { id: true, vin: true, marca: true, modelo: true } },
        aseguradora: { select: { id: true, nombre: true } },
      },
    });
  }

  async crear(dto: CreateClienteDto, actorUserId?: string) {
    const cliente = await this.prisma.cliente.create({
      data: { ...dto, datosFiscales: dto.datosFiscales as Prisma.InputJsonValue },
    });
    await this.audit.registrar({
      entidad: 'Cliente',
      entidadId: cliente.id,
      accion: 'create',
      actorUserId,
      diff: dto,
    });
    return cliente;
  }

  async actualizar(id: string, dto: UpdateClienteDto, actorUserId?: string) {
    await this.obtener(id);
    const cliente = await this.prisma.cliente.update({
      where: { id },
      data: { ...dto, datosFiscales: dto.datosFiscales as Prisma.InputJsonValue },
    });
    await this.audit.registrar({
      entidad: 'Cliente',
      entidadId: id,
      accion: 'update',
      actorUserId,
      diff: dto,
    });
    return cliente;
  }

  /** Baja lógica (activo=false), para no romper referencias de pólizas/expedientes. */
  async desactivar(id: string, actorUserId?: string) {
    await this.obtener(id);
    const cliente = await this.prisma.cliente.update({
      where: { id },
      data: { activo: false },
    });
    await this.audit.registrar({
      entidad: 'Cliente',
      entidadId: id,
      accion: 'desactivar',
      actorUserId,
    });
    return cliente;
  }
}
