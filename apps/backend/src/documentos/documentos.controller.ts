import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Rol } from '@prisma/client';
import { DocumentosService } from './documentos.service';
import { AprobarExtraccionDto } from './dto/aprobar.dto';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, JwtUser } from '../auth/current-user.decorator';

@Controller('documentos')
export class DocumentosController {
  constructor(private readonly documentos: DocumentosService) {}

  /** Bandeja de "documentos por procesar". */
  @Get('bandeja')
  bandeja() {
    return this.documentos.bandeja();
  }

  @Get(':id')
  obtener(@Param('id') id: string) {
    return this.documentos.obtener(id);
  }

  /** URL temporal para previsualizar el archivo. */
  @Get(':id/enlace')
  enlace(@Param('id') id: string) {
    return this.documentos.enlace(id);
  }

  @Get(':id/revision')
  revision(@Param('id') id: string) {
    return this.documentos.revision(id);
  }

  /** Dispara (o repite) la extracción con Claude. */
  @Roles(Rol.captura, Rol.tecnico, Rol.administracion, Rol.admin)
  @Post(':id/extraer')
  extraer(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.documentos.extraer(id, user.userId);
  }

  /** Aprueba la extracción revisada y crea las unidades en la flota del cliente. */
  @Roles(Rol.captura, Rol.tecnico, Rol.administracion, Rol.admin)
  @Post(':id/aprobar')
  aprobar(
    @Param('id') id: string,
    @Body() dto: AprobarExtraccionDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.documentos.aprobar(id, dto.unidades, dto.clienteId, user.userId);
  }

  @Roles(Rol.captura, Rol.administracion, Rol.admin)
  @Post(':id/descartar')
  descartar(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.documentos.descartar(id, user.userId);
  }
}
