import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Rol } from '@prisma/client';
import { NotificacionesService } from './notificaciones.service';
import { CurrentUser, JwtUser } from '../auth/current-user.decorator';

@Controller('notificaciones')
export class NotificacionesController {
  constructor(private readonly notificaciones: NotificacionesService) {}

  @Get()
  listar(@CurrentUser() user: JwtUser, @Query('noLeidas') noLeidas?: string) {
    return this.notificaciones.listar(user.userId, user.rol as Rol, noLeidas === 'true');
  }

  @Get('conteo')
  async conteo(@CurrentUser() user: JwtUser) {
    return { noLeidas: await this.notificaciones.contarNoLeidas(user.userId, user.rol as Rol) };
  }

  @Post(':id/leida')
  marcarLeida(@Param('id') id: string) {
    return this.notificaciones.marcarLeida(id);
  }
}
