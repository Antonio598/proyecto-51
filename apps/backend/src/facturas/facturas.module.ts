import { Module } from '@nestjs/common';
import { FacturasController } from './facturas.controller';
import { FacturasService } from './facturas.service';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [WhatsappModule],
  controllers: [FacturasController],
  providers: [FacturasService],
})
export class FacturasModule {}
