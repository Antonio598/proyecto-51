import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsEnum, IsOptional, IsString } from 'class-validator';
import { Periodicidad, Rol } from '@prisma/client';
import { CobranzaService } from './cobranza.service';
import { DesgloseService } from './desglose.service';
import { PolizasMadreService } from './polizas-madre.service';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { ServiceTokenGuard } from '../auth/service-token.guard';
import { CurrentUser, JwtUser } from '../auth/current-user.decorator';

class ProcesarDto {
  @IsOptional()
  @IsBoolean()
  enviarRecordatorios?: boolean;
}

class EnviarDesgloseDto {
  @IsString()
  documentoId: string;
}

class ConfigurarPlanDto {
  @IsOptional()
  @IsEnum(Periodicidad)
  periodicidad?: Periodicidad;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fechaEmision?: Date;
}

@Controller('cobranza')
export class CobranzaController {
  constructor(
    private readonly cobranza: CobranzaService,
    private readonly desglose: DesgloseService,
    private readonly polizasMadre: PolizasMadreService,
  ) {}

  @Get('dashboard')
  dashboard() {
    return this.cobranza.dashboard();
  }

  // ── Pólizas Madre (cobranza consolidada) ──

  @Get('madres')
  listarMadres(@Query('clienteId') clienteId?: string) {
    return this.polizasMadre.listar(clienteId);
  }

  @Get('madres/:id')
  detalleMadre(@Param('id') id: string) {
    return this.polizasMadre.detalle(id);
  }

  @Roles(Rol.administracion, Rol.tecnico, Rol.admin)
  @Patch('madres/:id/plan')
  configurarPlan(
    @Param('id') id: string,
    @Body() dto: ConfigurarPlanDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.polizasMadre.configurarPlan(id, dto, user.userId);
  }

  @Roles(Rol.administracion, Rol.admin)
  @Post('madres/:id/pagar')
  marcarPagado(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.polizasMadre.marcarPagado(id, user.userId);
  }

  /**
   * Endpoint que dispara n8n de forma programada.
   * Autenticado con `x-service-token`, no con JWT de usuario.
   * La lógica de negocio vive aquí; n8n sólo orquesta el cron.
   */
  @Public()
  @UseGuards(ServiceTokenGuard)
  @Post('procesar')
  procesar(@Body() dto: ProcesarDto) {
    return this.cobranza.procesarCiclo({ enviarRecordatorios: dto.enviarRecordatorios });
  }

  /** Red de seguridad: crea cortes de pólizas emitidas que se quedaron sin uno. */
  @Public()
  @UseGuards(ServiceTokenGuard)
  @Post('asegurar-cortes')
  asegurarCortes() {
    return this.cobranza.asegurarCortes();
  }

  // ── Módulo 8: desglose de costos ──

  @Roles(Rol.administracion, Rol.tecnico, Rol.admin)
  @Post('desglose/:clienteId')
  generarDesglose(@Param('clienteId') clienteId: string, @CurrentUser() user: JwtUser) {
    return this.desglose.generar(clienteId, user.userId);
  }

  @Roles(Rol.administracion, Rol.admin)
  @Post('desglose/:clienteId/enviar')
  enviarDesglose(
    @Param('clienteId') clienteId: string,
    @Body() dto: EnviarDesgloseDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.desglose.enviar(clienteId, dto.documentoId, user.userId);
  }
}
