import { Module } from '@nestjs/common';
import { AseguradorasController } from './aseguradoras.controller';

@Module({
  controllers: [AseguradorasController],
})
export class AseguradorasModule {}
