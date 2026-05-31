import { Module } from '@nestjs/common';
import { RespaldosController } from './respaldos.controller';
import { RespaldosService } from './respaldos.service';

@Module({
  controllers: [RespaldosController],
  providers: [RespaldosService],
})
export class RespaldosModule {}
