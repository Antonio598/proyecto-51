import { Module } from '@nestjs/common';
import { CobranzaController } from './cobranza.controller';
import { CobranzaService } from './cobranza.service';
import { DesgloseService } from './desglose.service';
import { PolizasMadreService } from './polizas-madre.service';
import { RecordatoriosService } from './recordatorios.service';

@Module({
  controllers: [CobranzaController],
  providers: [CobranzaService, DesgloseService, PolizasMadreService, RecordatoriosService],
  exports: [CobranzaService, DesgloseService, PolizasMadreService, RecordatoriosService],
})
export class CobranzaModule {}
