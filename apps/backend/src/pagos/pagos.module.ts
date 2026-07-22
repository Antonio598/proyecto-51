import { forwardRef, Module } from '@nestjs/common';
import { PagosController } from './pagos.controller';
import { PagosService } from './pagos.service';
import { ConciliacionService } from './conciliacion.service';
import { CobranzaModule } from '../cobranza/cobranza.module';
import { PolizasModule } from '../polizas/polizas.module';

@Module({
  imports: [forwardRef(() => CobranzaModule), PolizasModule],
  controllers: [PagosController],
  providers: [PagosService, ConciliacionService],
  // ConciliacionService se exporta para que la ingesta de WhatsApp pueda
  // intentar conciliar automáticamente los comprobantes entrantes.
  exports: [PagosService, ConciliacionService],
})
export class PagosModule {}
