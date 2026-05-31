import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApartadosController } from './apartados.controller';
import { ApartadosService } from './apartados.service';
import { Apartado } from './entities/apartado.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Apartado])],
  controllers: [ApartadosController],
  providers: [ApartadosService],
})
export class ApartadosModule {}
