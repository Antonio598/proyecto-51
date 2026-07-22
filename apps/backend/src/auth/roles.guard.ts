import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Rol } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';

/**
 * Guard de RBAC. Debe ejecutarse después del JwtAuthGuard.
 * Si el endpoint no declara @Roles(), permite a cualquier autenticado.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Rol[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest();
    if (!user || !required.includes(user.rol)) {
      throw new ForbiddenException('No tienes permisos para esta acción');
    }
    return true;
  }
}
