import { forwardRef, Module } from '@nestjs/common';
import { PolizasController } from './polizas.controller';
import { PolizasService } from './polizas.service';
import { ChecklistService } from './checklist.service';
import { CobranzaModule } from '../cobranza/cobranza.module';

@Module({
  imports: [forwardRef(() => CobranzaModule)],
  controllers: [PolizasController],
  providers: [PolizasService, ChecklistService],
  exports: [PolizasService, ChecklistService],
})
export class PolizasModule {}
