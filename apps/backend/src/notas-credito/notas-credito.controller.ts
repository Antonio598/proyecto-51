import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Rol } from '@prisma/client';
import { NotasCreditoService } from './notas-credito.service';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, JwtUser } from '../auth/current-user.decorator';

@Controller('notas-credito')
export class NotasCreditoController {
  constructor(private readonly notas: NotasCreditoService) {}

  @Get()
  listar() {
    return this.notas.listar();
  }

  /** Sube una nota de crédito; la IA la liga por RFC al cliente y a su factura. */
  @Roles(Rol.administracion, Rol.captura, Rol.admin)
  @Post()
  @UseInterceptors(FileInterceptor('archivo'))
  subir(@UploadedFile() archivo: Express.Multer.File, @CurrentUser() user: JwtUser) {
    return this.notas.subir(
      { buffer: archivo.buffer, nombre: archivo.originalname, mime: archivo.mimetype },
      user.userId,
    );
  }

  /** Vincula manualmente una nota de crédito a una factura. */
  @Roles(Rol.administracion, Rol.captura, Rol.admin)
  @Patch(':id/factura')
  vincularFactura(
    @Param('id') id: string,
    @Body('facturaId') facturaId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.notas.vincularFactura(id, facturaId, user.userId);
  }
}
