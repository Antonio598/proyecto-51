import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Rol } from '@prisma/client';
import { ClientesService } from './clientes.service';
import { UnidadesService } from './unidades.service';
import { AuditService } from '../audit/audit.service';
import { CreateClienteDto, UpdateClienteDto } from './dto/cliente.dto';
import { CreateUnidadDto, UpdateUnidadDto } from './dto/unidad.dto';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, JwtUser } from '../auth/current-user.decorator';

@Controller('clientes')
export class ClientesController {
  constructor(
    private readonly clientes: ClientesService,
    private readonly unidades: UnidadesService,
    private readonly audit: AuditService,
  ) {}

  // ── Clientes ──
  @Get()
  listar(@Query('buscar') buscar?: string) {
    return this.clientes.listar(buscar);
  }

  @Get(':id')
  obtener(@Param('id') id: string) {
    return this.clientes.obtener(id);
  }

  @Get(':id/historial-aseguramiento')
  historialAseguramiento(@Param('id') id: string) {
    return this.clientes.historialAseguramiento(id);
  }

  @Get(':id/auditoria')
  auditoria(@Param('id') id: string) {
    return this.audit.historial('Cliente', id);
  }

  @Roles(Rol.captura, Rol.administracion, Rol.admin)
  @Post()
  crear(@Body() dto: CreateClienteDto, @CurrentUser() user: JwtUser) {
    return this.clientes.crear(dto, user.userId);
  }

  @Roles(Rol.captura, Rol.administracion, Rol.admin)
  @Patch(':id')
  actualizar(
    @Param('id') id: string,
    @Body() dto: UpdateClienteDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.clientes.actualizar(id, dto, user.userId);
  }

  @Roles(Rol.administracion, Rol.admin)
  @Delete(':id')
  desactivar(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.clientes.desactivar(id, user.userId);
  }

  // ── Unidades (flota) ──
  @Get(':id/unidades')
  listarUnidades(@Param('id') clienteId: string) {
    return this.unidades.listar(clienteId);
  }

  @Roles(Rol.captura, Rol.administracion, Rol.admin)
  @Post(':id/unidades')
  crearUnidad(
    @Param('id') clienteId: string,
    @Body() dto: CreateUnidadDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.unidades.crear(clienteId, dto, user.userId);
  }

  @Roles(Rol.captura, Rol.administracion, Rol.admin)
  @Patch('unidades/:unidadId')
  actualizarUnidad(
    @Param('unidadId') unidadId: string,
    @Body() dto: UpdateUnidadDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.unidades.actualizar(unidadId, dto, user.userId);
  }

  @Roles(Rol.administracion, Rol.admin)
  @Delete('unidades/:unidadId')
  eliminarUnidad(@Param('unidadId') unidadId: string, @CurrentUser() user: JwtUser) {
    return this.unidades.eliminar(unidadId, user.userId);
  }
}
