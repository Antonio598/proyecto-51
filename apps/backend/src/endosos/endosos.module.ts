import { Module } from '@nestjs/common';
import { EndososController } from './endosos.controller';
import { EndososService } from './endosos.service';
import { CobranzaModule } from '../cobranza/cobranza.module';

@Module({
  imports: [CobranzaModule],
  controllers: [EndososController],
  providers: [EndososService],
})
export class EndososModule {}
