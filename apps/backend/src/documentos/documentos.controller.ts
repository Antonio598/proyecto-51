import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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

  /**
   * Subida manual de un documento (Excel, PDF o imagen). Cae en la bandeja
   * junto con los recibidos por WhatsApp y sigue el mismo flujo de extracción.
   */
  @Roles(Rol.captura, Rol.tecnico, Rol.administracion, Rol.admin)
  @Post('subir')
  @UseInterceptors(FileInterceptor('archivo'))
  subir(
    @UploadedFile() archivo: Express.Multer.File,
    @Body('clienteId') clienteId: string | undefined,
    @CurrentUser() user: JwtUser,
  ) {
    return this.documentos.subirManual(
      { buffer: archivo.buffer, nombre: archivo.originalname, mime: archivo.mimetype },
      clienteId || undefined,
      user.userId,
    );
  }

  /** Documentos recibidos vinculados a un cliente (con sus archivos originales). */
  @Get('cliente/:clienteId')
  documentosDeCliente(@Param('clienteId') clienteId: string) {
    return this.documentos.documentosDeCliente(clienteId);
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

  /** URL temporal de un archivo concreto dentro de un documento (paquete). */
  @Get(':id/archivo/:indice/enlace')
  enlaceArchivo(@Param('id') id: string, @Param('indice') indice: string) {
    return this.documentos.enlaceArchivo(id, Number(indice));
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
    return this.documentos.aprobar(id, dto.unidades, dto.clienteId, user.userId, {
      rfc: dto.clienteRfc,
      razonSocial: dto.clienteRazonSocial,
    });
  }

  @Roles(Rol.captura, Rol.administracion, Rol.admin)
  @Post(':id/descartar')
  descartar(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.documentos.descartar(id, user.userId);
  }
}
