import { Body, Controller, Delete, Get, Post, Put, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth.guard';
import { RolesGuard } from '../../roles.guard';
import { Roles } from '../../decorators';
import { BeneficiosService } from './beneficios.service';
import { CreateBeneficioDto } from './dto/create-beneficio.dto';
import { UpdateBeneficioDto } from './dto/update-beneficio.dto';
import { AsignarBeneficioDto } from './dto/asignar-beneficio.dto';

@Controller('api/beneficios')
@UseGuards(AuthGuard, RolesGuard)
export class BeneficiosController {
  constructor(private readonly beneficiosService: BeneficiosService) {}
  @Get() findAll(@Req() req: any, @Res() res: any) { return this.beneficiosService.findAll(req, res); }
  @Roles('admin')
  @Post() create(@Body() _dto: CreateBeneficioDto, @Req() req: any, @Res() res: any) { return this.beneficiosService.create(req, res); }
  @Roles('admin')
  @Put(':id') update(@Body() _dto: UpdateBeneficioDto, @Req() req: any, @Res() res: any) { return this.beneficiosService.update(req, res); }
  @Roles('admin')
  @Delete(':id') remove(@Req() req: any, @Res() res: any) { return this.beneficiosService.remove(req, res); }
  @Get('asignaciones/:type/:id') asignaciones(@Req() req: any, @Res() res: any) { return this.beneficiosService.asignaciones(req, res); }
  @Roles('admin')
  @Post('asignar') asignar(@Body() _dto: AsignarBeneficioDto, @Req() req: any, @Res() res: any) { return this.beneficiosService.asignar(req, res); }
  @Roles('admin')
  @Post('desasignar') desasignar(@Body() _dto: AsignarBeneficioDto, @Req() req: any, @Res() res: any) { return this.beneficiosService.desasignar(req, res); }
}
