import { forwardRef, Module } from '@nestjs/common';
import { CobranzaController } from './cobranza.controller';
import { CobranzaService } from './cobranza.service';
import { DesgloseService } from './desglose.service';
import { PolizasMadreService } from './polizas-madre.service';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [forwardRef(() => WhatsappModule)],
  controllers: [CobranzaController],
  providers: [CobranzaService, DesgloseService, PolizasMadreService],
  exports: [CobranzaService, DesgloseService, PolizasMadreService],
})
export class CobranzaModule {}
