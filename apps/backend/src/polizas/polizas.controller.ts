import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { EstadoPoliza, Rol } from '@prisma/client';
import { PolizasService } from './polizas.service';
import { ChecklistService } from './checklist.service';
import { MarcarEmitidaDto, PrepararEmisionDto } from './dto/poliza.dto';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, JwtUser } from '../auth/current-user.decorator';

@Controller('polizas')
export class PolizasController {
  constructor(
    private readonly polizas: PolizasService,
    private readonly checklist: ChecklistService,
  ) {}

  @Get()
  listar(
    @Query('estado') estado?: EstadoPoliza,
    @Query('clienteId') clienteId?: string,
    @Query('expedienteId') expedienteId?: string,
  ) {
    return this.polizas.listar({ estado, clienteId, expedienteId });
  }

  @Get(':id')
  obtener(@Param('id') id: string) {
    return this.polizas.obtener(id);
  }

  /** Checklist de captura en el portal, en el orden en que el portal pide los datos. */
  @Get('expediente/:expedienteId/checklist')
  checklistEmision(@Param('expedienteId') expedienteId: string) {
    return this.checklist.emision(expedienteId);
  }

  @Get('expediente/:expedienteId/checklist.pdf')
  async checklistPdf(@Param('expedienteId') expedienteId: string, @Res() res: Response) {
    const pdf = await this.checklist.emisionPdf(expedienteId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="checklist-${expedienteId}.pdf"`);
    res.send(pdf);
  }

  /** Prepara las pólizas por unidad y genera su checklist. */
  @Roles(Rol.tecnico, Rol.administracion, Rol.admin)
  @Post('expediente/:expedienteId/emitir')
  prepararEmision(
    @Param('expedienteId') expedienteId: string,
    @Body() dto: PrepararEmisionDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.polizas.prepararEmision(
      expedienteId,
      dto.aseguradoraId,
      dto.vigenciaInicio,
      user.userId,
    );
  }

  /** Tras capturarla en el portal: marcar emitida + folio. Crea el primer corte. */
  @Roles(Rol.captura, Rol.tecnico, Rol.administracion, Rol.admin)
  @Post(':id/emitida')
  marcarEmitida(
    @Param('id') id: string,
    @Body() dto: MarcarEmitidaDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.polizas.marcarEmitida(id, dto, user.userId);
  }

  /** Adjunta el PDF de la póliza; Claude sugiere el folio para no re-teclearlo. */
  @Roles(Rol.captura, Rol.tecnico, Rol.administracion, Rol.admin)
  @Post(':id/pdf')
  @UseInterceptors(FileInterceptor('archivo'))
  adjuntarPdf(
    @Param('id') id: string,
    @UploadedFile() archivo: Express.Multer.File,
    @CurrentUser() user: JwtUser,
  ) {
    return this.polizas.adjuntarPdf(
      id,
      {
        buffer: archivo.buffer,
        nombre: archivo.originalname,
        mime: archivo.mimetype,
      },
      user.userId,
    );
  }
}
