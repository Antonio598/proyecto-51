import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { EstadoExpediente, Rol } from '@prisma/client';
import { ExpedientesService } from './expedientes.service';
import { ComparativoService } from './comparativo.service';
import { PropuestaClienteService } from './propuesta-cliente.service';
import {
  ActualizarExpedienteDto,
  CambiarEstadoDto,
  ComentarioDto,
  CrearExpedienteDto,
  GenerarPropuestaDto,
  PropuestaAseguradoraDto,
} from './dto/expediente.dto';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, JwtUser } from '../auth/current-user.decorator';

@Controller('expedientes')
export class ExpedientesController {
  constructor(
    private readonly expedientes: ExpedientesService,
    private readonly comparativo: ComparativoService,
    private readonly propuestaCliente: PropuestaClienteService,
  ) {}

  @Get()
  listar(@Query('estado') estado?: EstadoExpediente) {
    return this.expedientes.listar(estado);
  }

  @Get(':id')
  obtener(@Param('id') id: string) {
    return this.expedientes.obtener(id);
  }

  @Get(':id/auditoria')
  auditoria(@Param('id') id: string) {
    return this.expedientes.auditoria(id);
  }

  @Roles(Rol.tecnico, Rol.captura, Rol.administracion, Rol.admin)
  @Post()
  crear(@Body() dto: CrearExpedienteDto, @CurrentUser() user: JwtUser) {
    return this.expedientes.crear(dto, user.userId);
  }

  @Roles(Rol.tecnico, Rol.administracion, Rol.admin)
  @Patch(':id')
  actualizar(
    @Param('id') id: string,
    @Body() dto: ActualizarExpedienteDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.expedientes.actualizar(id, dto, user.userId);
  }

  /**
   * Captura la propuesta de una aseguradora. Si con ésta se completan todas
   * las solicitadas, el comparativo se genera y notifica automáticamente.
   */
  @Roles(Rol.tecnico, Rol.admin)
  @Post(':id/propuestas')
  capturarPropuesta(
    @Param('id') id: string,
    @Body() dto: PropuestaAseguradoraDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.expedientes.capturarPropuesta(id, dto, user.userId);
  }

  /** Regenerar el comparativo a mano (p. ej. tras un ajuste). */
  @Roles(Rol.tecnico, Rol.admin)
  @Post(':id/comparativo')
  generarComparativo(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.comparativo.generar(id, user.userId);
  }

  /** Aprobación / ajuste por parte del director comercial. */
  @Roles(Rol.comercial, Rol.tecnico, Rol.administracion, Rol.admin)
  @Post(':id/estado')
  cambiarEstado(
    @Param('id') id: string,
    @Body() dto: CambiarEstadoDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.expedientes.cambiarEstado(id, dto.estado, user.userId);
  }

  @Post(':id/comentarios')
  comentar(@Param('id') id: string, @Body() dto: ComentarioDto, @CurrentUser() user: JwtUser) {
    return this.expedientes.comentar(id, dto.contenido, user.userId);
  }

  /** Módulo 6 — genera el PDF de la propuesta final para el cliente. */
  @Roles(Rol.administracion, Rol.admin)
  @Post(':id/propuesta-cliente')
  generarPropuesta(
    @Param('id') id: string,
    @Body() dto: GenerarPropuestaDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.propuestaCliente.generar(id, dto.aseguradoraId, user.userId);
  }

  /** Envía la propuesta al cliente por WhatsApp. */
  @Roles(Rol.administracion, Rol.admin)
  @Post(':id/propuesta-cliente/enviar')
  enviarPropuesta(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.propuestaCliente.enviar(id, user.userId);
  }
}
