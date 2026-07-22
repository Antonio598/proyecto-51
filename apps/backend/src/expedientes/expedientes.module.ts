import { Module } from '@nestjs/common';
import { ExpedientesController } from './expedientes.controller';
import { ExpedientesService } from './expedientes.service';
import { ComparativoService } from './comparativo.service';
import { PropuestaClienteService } from './propuesta-cliente.service';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [WhatsappModule],
  controllers: [ExpedientesController],
  providers: [ExpedientesService, ComparativoService, PropuestaClienteService],
  exports: [ExpedientesService, ComparativoService],
})
export class ExpedientesModule {}
