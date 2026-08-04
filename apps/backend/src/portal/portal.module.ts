import { Module } from '@nestjs/common';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';
import { PagosModule } from '../pagos/pagos.module';

@Module({
  // PagosModule exporta ConciliacionService (para conciliar comprobantes del portal).
  imports: [PagosModule],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
