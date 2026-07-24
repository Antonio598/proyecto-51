import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Rol } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CrearUsuarioDto } from './dto/usuario.dto';

@Injectable()
export class UsuariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Nunca se devuelve el hash de la contraseña. */
  private readonly seleccion = {
    id: true,
    nombre: true,
    email: true,
    rol: true,
    activo: true,
    createdAt: true,
  };

  listar() {
    return this.prisma.user.findMany({
      select: this.seleccion,
      orderBy: { nombre: 'asc' },
    });
  }

  async crear(dto: CrearUsuarioDto, actorUserId: string) {
    const existe = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existe) {
      throw new ConflictException('Ya existe un usuario con ese correo');
    }

    const usuario = await this.prisma.user.create({
      data: {
        nombre: dto.nombre,
        email: dto.email,
        rol: dto.rol,
        passwordHash: await bcrypt.hash(dto.password, 10),
      },
      select: this.seleccion,
    });

    await this.audit.registrar({
      entidad: 'User',
      entidadId: usuario.id,
      accion: 'create',
      actorUserId,
      diff: { email: dto.email, rol: dto.rol },
    });
    return usuario;
  }

  /** Cambio de la propia contraseña: exige la actual para confirmar identidad. */
  async cambiarPassword(usuarioId: string, actual: string, nueva: string) {
    const usuario = await this.prisma.user.findUnique({ where: { id: usuarioId } });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    const ok = await bcrypt.compare(actual, usuario.passwordHash);
    if (!ok) throw new UnauthorizedException('La contraseña actual no es correcta');

    await this.prisma.user.update({
      where: { id: usuarioId },
      data: { passwordHash: await bcrypt.hash(nueva, 10) },
    });
    await this.audit.registrar({
      entidad: 'User',
      entidadId: usuarioId,
      accion: 'cambiar_password',
      actorUserId: usuarioId,
    });
    return { ok: true };
  }

  /** Reseteo por un administrador; no pide la contraseña anterior. */
  async resetPassword(id: string, nueva: string, actorUserId: string) {
    const usuario = await this.prisma.user.findUnique({ where: { id } });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(nueva, 10) },
    });
    await this.audit.registrar({
      entidad: 'User',
      entidadId: id,
      accion: 'reset_password',
      actorUserId,
    });
    return { ok: true };
  }

  async cambiarEstado(id: string, activo: boolean, actorUserId: string) {
    const usuario = await this.prisma.user.findUnique({ where: { id } });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    // No permitir que el sistema se quede sin ningún administrador activo.
    if (!activo && usuario.rol === Rol.admin) {
      const admins = await this.prisma.user.count({
        where: { rol: Rol.admin, activo: true, id: { not: id } },
      });
      if (admins === 0) {
        throw new BadRequestException('No puedes desactivar al último administrador activo');
      }
    }

    const actualizado = await this.prisma.user.update({
      where: { id },
      data: { activo },
      select: this.seleccion,
    });
    await this.audit.registrar({
      entidad: 'User',
      entidadId: id,
      accion: activo ? 'activar' : 'desactivar',
      actorUserId,
    });
    return actualizado;
  }
}
