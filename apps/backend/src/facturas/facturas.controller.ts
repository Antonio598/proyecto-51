import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsIn } from 'class-validator';
import { Rol, TipoDocumento } from '@prisma/client';
import { FacturasService, TipoFactura } from './facturas.service';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, JwtUser } from '../auth/current-user.decorator';

class SubirFacturaDto {
  @IsIn([TipoDocumento.factura, TipoDocumento.complemento])
  tipo: TipoFactura;
}

@Controller('facturas')
export class FacturasController {
  constructor(private readonly facturas: FacturasService) {}

  @Get()
  listar(@Query('polizaId') polizaId?: string, @Query('clienteId') clienteId?: string) {
    if (clienteId) return this.facturas.listarPorCliente(clienteId);
    return this.facturas.listarPorPoliza(polizaId ?? '');
  }

  /**
   * Sube una factura/complemento y la liga por RFC al cliente (la IA lee el RFC).
   */
  @Roles(Rol.administracion, Rol.captura, Rol.admin)
  @Post('por-rfc')
  @UseInterceptors(FileInterceptor('archivo'))
  subirPorRfc(
    @Body() dto: SubirFacturaDto,
    @UploadedFile() archivo: Express.Multer.File,
    @CurrentUser() user: JwtUser,
  ) {
    return this.facturas.subirPorRfc(
      dto.tipo,
      { buffer: archivo.buffer, nombre: archivo.originalname, mime: archivo.mimetype },
      user.userId,
    );
  }

  /** Sube la factura o complemento descargado del portal de la aseguradora. */
  @Roles(Rol.administracion, Rol.captura, Rol.admin)
  @Post('poliza/:polizaId')
  @UseInterceptors(FileInterceptor('archivo'))
  subir(
    @Param('polizaId') polizaId: string,
    @Body() dto: SubirFacturaDto,
    @UploadedFile() archivo: Express.Multer.File,
    @CurrentUser() user: JwtUser,
  ) {
    return this.facturas.subir(
      polizaId,
      dto.tipo,
      { buffer: archivo.buffer, nombre: archivo.originalname, mime: archivo.mimetype },
      user.userId,
    );
  }

  @Roles(Rol.administracion, Rol.admin)
  @Post(':id/enviar')
  enviar(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.facturas.enviar(id, user.userId);
  }
}
