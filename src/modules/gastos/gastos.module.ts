import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GastosController } from './gastos.controller';
import { GastosService } from './gastos.service';
import { Gasto } from './entities/gasto.entity';

@Module({ imports: [TypeOrmModule.forFeature([Gasto])], controllers: [GastosController], providers: [GastosService] })
export class GastosModule {}
