import { Module } from '@nestjs/common';
import { FacturasController } from './facturas.controller';
import { FacturasService } from './facturas.service';

@Module({
  controllers: [FacturasController],
  providers: [FacturasService],
})
export class FacturasModule {}
