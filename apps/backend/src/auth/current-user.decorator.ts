import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface JwtUser {
  userId: string;
  email: string;
  rol: string;
  nombre: string;
}

/** Inyecta el usuario autenticado desde el JWT. Ej: @CurrentUser() user: JwtUser */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
