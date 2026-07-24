import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Rol } from '@prisma/client';
import { UsuariosService } from './usuarios.service';
import { CambiarPasswordDto, CrearUsuarioDto, ResetPasswordDto } from './dto/usuario.dto';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, JwtUser } from '../auth/current-user.decorator';

@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  /** Cualquier usuario autenticado puede cambiar SU propia contraseña. */
  @Post('mi-password')
  cambiarMiPassword(@Body() dto: CambiarPasswordDto, @CurrentUser() user: JwtUser) {
    return this.usuarios.cambiarPassword(user.userId, dto.actual, dto.nueva);
  }

  // ── De aquí en adelante, sólo administración/admin ──

  @Roles(Rol.administracion, Rol.admin)
  @Get()
  listar() {
    return this.usuarios.listar();
  }

  @Roles(Rol.administracion, Rol.admin)
  @Post()
  crear(@Body() dto: CrearUsuarioDto, @CurrentUser() user: JwtUser) {
    return this.usuarios.crear(dto, user.userId);
  }

  @Roles(Rol.administracion, Rol.admin)
  @Post(':id/reset-password')
  resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.usuarios.resetPassword(id, dto.nueva, user.userId);
  }

  @Roles(Rol.administracion, Rol.admin)
  @Patch(':id/activo')
  cambiarEstado(
    @Param('id') id: string,
    @Body('activo') activo: boolean,
    @CurrentUser() user: JwtUser,
  ) {
    return this.usuarios.cambiarEstado(id, activo, user.userId);
  }
}
