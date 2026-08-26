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
import { EndososService } from './endosos.service';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, JwtUser } from '../auth/current-user.decorator';

@Controller('endosos')
export class EndososController {
  constructor(private readonly endosos: EndososService) {}

  @Get()
  listar() {
    return this.endosos.listar();
  }

  /** Sube un endoso; la IA identifica movimiento/serie/RFC y localiza la póliza. */
  @Roles(Rol.tecnico, Rol.administracion, Rol.admin)
  @Post()
  @UseInterceptors(FileInterceptor('archivo'))
  procesar(@UploadedFile() archivo: Express.Multer.File, @CurrentUser() user: JwtUser) {
    return this.endosos.procesar(
      { buffer: archivo.buffer, nombre: archivo.originalname, mime: archivo.mimetype },
      user.userId,
    );
  }

  /** Aplica el endoso confirmado (baja = cancela; alta = marca alta). */
  @Roles(Rol.tecnico, Rol.administracion, Rol.admin)
  @Post(':id/aplicar')
  aplicar(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.endosos.aplicar(id, user.userId);
  }

  /** Aplica un ALTA creando una póliza hija nueva (por RFC) con su flota. */
  @Roles(Rol.tecnico, Rol.administracion, Rol.admin)
  @Post(':id/aplicar-alta')
  aplicarAlta(
    @Param('id') id: string,
    @Body() body: { aseguradoraId: string; flotaId?: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.endosos.aplicarAlta(
      id,
      { aseguradoraId: body.aseguradoraId, flotaId: body.flotaId },
      user.userId,
    );
  }
}
