import { Module } from '@nestjs/common';
import { PolizasController } from './polizas.controller';
import { PolizasService } from './polizas.service';
import { ChecklistService } from './checklist.service';

@Module({
  controllers: [PolizasController],
  providers: [PolizasService, ChecklistService],
  exports: [PolizasService, ChecklistService],
})
export class PolizasModule {}
