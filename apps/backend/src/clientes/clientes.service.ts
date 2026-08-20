import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateClienteDto, UpdateClienteDto } from './dto/cliente.dto';
import { normalizarRfc } from './rfc.util';

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
        unidades: { orderBy: { createdAt: 'asc' }, include: { flota: true } },
        flotas: { orderBy: { nombre: 'asc' } },
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
      data: {
        ...dto,
        rfc: normalizarRfc(dto.rfc),
        datosFiscales: dto.datosFiscales as Prisma.InputJsonValue,
      },
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
      data: {
        ...dto,
        ...(dto.rfc !== undefined ? { rfc: normalizarRfc(dto.rfc) } : {}),
        datosFiscales: dto.datosFiscales as Prisma.InputJsonValue,
      },
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

  /**
   * Borra el cliente por completo (unidades, flotas, documentos y expedientes).
   * Se bloquea si tiene pólizas registradas: esas son datos financieros y no
   * deben borrarse a la ligera (en ese caso, usar "desactivar").
   */
  async eliminar(id: string, actorUserId?: string) {
    await this.obtener(id);

    const polizas = await this.prisma.poliza.count({ where: { clienteId: id } });
    if (polizas > 0) {
      throw new BadRequestException(
        'El cliente tiene pólizas registradas; no se puede eliminar. Desactívalo si quieres ocultarlo.',
      );
    }

    // Orden: primero lo que referencia al cliente y no se borra en cascada
    // (documentos y expedientes); al borrar el cliente se van sus unidades y flotas.
    await this.prisma.$transaction([
      this.prisma.documento.deleteMany({ where: { clienteId: id } }),
      this.prisma.expediente.deleteMany({ where: { clienteId: id } }),
      this.prisma.cliente.delete({ where: { id } }),
    ]);

    await this.audit.registrar({
      entidad: 'Cliente',
      entidadId: id,
      accion: 'eliminar',
      actorUserId,
    });
    return { ok: true };
  }

  /** Elimina una flota; sus unidades quedan sin flota asignada (no se borran). */
  async eliminarFlota(flotaId: string, actorUserId?: string) {
    const flota = await this.prisma.flota.findUnique({ where: { id: flotaId } });
    if (!flota) throw new NotFoundException('Flota no encontrada');

    await this.prisma.flota.delete({ where: { id: flotaId } });

    await this.audit.registrar({
      entidad: 'Flota',
      entidadId: flotaId,
      accion: 'eliminar',
      actorUserId,
    });
    return { ok: true };
  }
}
