import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { Rol } from '@prisma/client';
import { CobranzaService } from './cobranza.service';
import { DesgloseService } from './desglose.service';
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

@Controller('cobranza')
export class CobranzaController {
  constructor(
    private readonly cobranza: CobranzaService,
    private readonly desglose: DesgloseService,
  ) {}

  @Get('dashboard')
  dashboard() {
    return this.cobranza.dashboard();
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
