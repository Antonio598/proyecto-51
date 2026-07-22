import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { FormaPago, Rol } from '@prisma/client';
import { PagosService } from './pagos.service';
import { ConciliacionService } from './conciliacion.service';
import { ChecklistService } from '../polizas/checklist.service';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, JwtUser } from '../auth/current-user.decorator';

class RegistrarPagoDto {
  @IsString()
  corteId: string;

  @IsString()
  documentoId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monto: number;

  @Type(() => Date)
  @IsDate()
  fecha: Date;

  @IsOptional()
  @IsEnum(FormaPago)
  forma?: FormaPago;
}

@Controller('pagos')
export class PagosController {
  constructor(
    private readonly pagos: PagosService,
    private readonly conciliacion: ConciliacionService,
    private readonly checklist: ChecklistService,
  ) {}

  /** Comprobantes recibidos por WhatsApp aún sin convertir en pago. */
  @Get('comprobantes')
  comprobantes() {
    return this.conciliacion.pendientes();
  }

  /** Lectura del comprobante + candidatos de conciliación ya calculados. */
  @Get('comprobantes/:documentoId')
  detalleComprobante(@Param('documentoId') documentoId: string) {
    return this.conciliacion.detalle(documentoId);
  }

  /** Re-ejecuta la conciliación de un comprobante (p. ej. tras corregir datos). */
  @Roles(Rol.administracion, Rol.admin)
  @Post('comprobantes/:documentoId/conciliar')
  conciliar(@Param('documentoId') documentoId: string) {
    return this.conciliacion.intentar(documentoId);
  }

  /** Pagos capturados que faltan aplicar en el portal de la aseguradora. */
  @Get('pendientes')
  pendientes() {
    return this.pagos.pendientesDeAplicar();
  }

  @Get()
  listar(@Query('polizaId') polizaId: string) {
    return this.pagos.listarPorPoliza(polizaId);
  }

  /** Checklist de qué aplicar y en qué póliza dentro del portal. */
  @Get(':id/checklist')
  checklistAplicacion(@Param('id') id: string) {
    return this.checklist.aplicacionPago(id);
  }

  @Roles(Rol.administracion, Rol.captura, Rol.admin)
  @Post()
  registrar(@Body() dto: RegistrarPagoDto, @CurrentUser() user: JwtUser) {
    return this.pagos.registrarDesdeComprobante(dto, user.userId);
  }

  /**
   * Un solo clic: confirma que el pago ya se aplicó en el portal.
   * El sistema cierra el corte, abre el siguiente y lo saca de pendientes.
   */
  @Roles(Rol.administracion, Rol.captura, Rol.admin)
  @Post(':id/aplicado')
  confirmarAplicado(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.pagos.confirmarAplicado(id, user.userId);
  }
}
