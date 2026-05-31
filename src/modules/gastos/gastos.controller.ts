import { Body, Controller, Delete, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth.guard';
import { RolesGuard } from '../../roles.guard';
import { Roles } from '../../decorators';
import { GastosService } from './gastos.service';
import { CreateGastoDto } from './dto/create-gasto.dto';
import { CreateCategoriaGastoDto } from './dto/create-categoria-gasto.dto';

@Controller('api/gastos')
@UseGuards(AuthGuard, RolesGuard)
export class GastosController {
  constructor(private readonly gastosService: GastosService) {}
  @Get() findAll(@Req() req: any, @Res() res: any) { return this.gastosService.findAll(req, res); }
  @Roles('admin')
  @Post() create(@Body() _dto: CreateGastoDto, @Req() req: any, @Res() res: any) { return this.gastosService.create(req, res); }
  @Roles('admin')
  @Delete(':id') remove(@Req() req: any, @Res() res: any) { return this.gastosService.remove(req, res); }
  @Get('categorias') categorias(@Req() req: any, @Res() res: any) { return this.gastosService.categorias(req, res); }
  @Roles('admin')
  @Post('categorias') crearCategoria(@Body() _dto: CreateCategoriaGastoDto, @Req() req: any, @Res() res: any) {
    return this.gastosService.crearCategoria(req, res);
  }
}
