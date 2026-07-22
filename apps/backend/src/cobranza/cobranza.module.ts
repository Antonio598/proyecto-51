import { forwardRef, Module } from '@nestjs/common';
import { CobranzaController } from './cobranza.controller';
import { CobranzaService } from './cobranza.service';
import { DesgloseService } from './desglose.service';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [forwardRef(() => WhatsappModule)],
  controllers: [CobranzaController],
  providers: [CobranzaService, DesgloseService],
  exports: [CobranzaService, DesgloseService],
})
export class CobranzaModule {}
