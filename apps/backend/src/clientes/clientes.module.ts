import { Module } from '@nestjs/common';
import { ClientesController } from './clientes.controller';
import { ClientesService } from './clientes.service';
import { UnidadesService } from './unidades.service';

@Module({
  controllers: [ClientesController],
  providers: [ClientesService, UnidadesService],
  exports: [ClientesService, UnidadesService],
})
export class ClientesModule {}
