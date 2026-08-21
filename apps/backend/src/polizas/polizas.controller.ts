import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import {
  ActualizarCobranzaDto,
  ActualizarEnlaceDto,
  CrearPorEnlaceDto,
  MarcarEmitidaDto,
  PrepararEmisionDto,
} from './dto/poliza.dto';
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
    @Query('serie') serie?: string,
  ) {
    return this.polizas.listar({ estado, clienteId, expedienteId, serie });
  }

  /**
   * Consulta de vigencia por número de serie (VIN): responde
   * ACTIVA/CANCELADA/INACTIVA + cliente, RFC y fechas. Read-only.
   */
  @Get('consulta')
  consultaVigencia(@Query('serie') serie: string) {
    return this.polizas.consultarPorSerie(serie ?? '');
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
      dto.flotaId,
    );
  }

  /** Registra pólizas por LIGA de nube (Dropbox): una por unidad activa. */
  @Roles(Rol.tecnico, Rol.administracion, Rol.admin)
  @Post('expediente/:expedienteId/por-enlace')
  crearPorEnlace(
    @Param('expedienteId') expedienteId: string,
    @Body() dto: CrearPorEnlaceDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.polizas.crearDesdeEnlace(
      expedienteId,
      {
        aseguradoraId: dto.aseguradoraId,
        urlNube: dto.urlNube,
        vigenciaInicio: dto.vigenciaInicio,
        flotaId: dto.flotaId,
      },
      user.userId,
    );
  }

  /** Corrige o agrega la liga de nube de una póliza. */
  @Roles(Rol.tecnico, Rol.administracion, Rol.admin)
  @Patch(':id/enlace')
  actualizarEnlace(
    @Param('id') id: string,
    @Body() dto: ActualizarEnlaceDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.polizas.actualizarEnlace(id, dto.urlNube, user.userId);
  }

  /** Captura a mano los datos de cobranza (prima neta, gastos, total, pagos). */
  @Roles(Rol.administracion, Rol.admin)
  @Patch(':id/cobranza')
  actualizarCobranza(
    @Param('id') id: string,
    @Body() dto: ActualizarCobranzaDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.polizas.actualizarCobranza(id, dto, user.userId);
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
