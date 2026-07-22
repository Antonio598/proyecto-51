import { forwardRef, Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { IngestaService } from './ingesta.service';
import { PagosModule } from '../pagos/pagos.module';

@Module({
  // forwardRef: la ingesta usa ConciliacionService y la cobranza usa WhatsappService.
  imports: [forwardRef(() => PagosModule)],
  controllers: [WhatsappController],
  providers: [WhatsappService, IngestaService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
