import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth.guard';
import { RolesGuard } from '../../roles.guard';
import { Roles } from '../../decorators';
import { ApartadosService } from './apartados.service';
import { CreateApartadoDto } from './dto/create-apartado.dto';
import { RegistrarPagoApartadoDto } from './dto/registrar-pago-apartado.dto';

@Controller('api/apartados')
@UseGuards(AuthGuard, RolesGuard)
export class ApartadosController {
  constructor(private readonly apartadosService: ApartadosService) {}

  @Get('cuentas-por-cobrar')
  cuentasPorCobrar(@Req() req: any, @Res() res: any) {
    return this.apartadosService.cuentasPorCobrar(req, res);
  }

  @Get('alertas')
  alertas(@Req() req: any, @Res() res: any) {
    return this.apartadosService.alertas(req, res);
  }

  @Get()
  findAll(@Req() req: any, @Res() res: any) {
    return this.apartadosService.findAll(req, res);
  }

  @Get(':id')
  findOne(@Req() req: any, @Res() res: any) {
    return this.apartadosService.findOne(req, res);
  }

  @Post()
  create(@Body() _dto: CreateApartadoDto, @Req() req: any, @Res() res: any) {
    return this.apartadosService.create(req, res);
  }

  @Post(':id/pago')
  registrarPago(@Body() _dto: RegistrarPagoApartadoDto, @Req() req: any, @Res() res: any) {
    return this.apartadosService.registrarPago(req, res);
  }

  @Roles('admin')
  @Post(':id/cancelar')
  cancel(@Req() req: any, @Res() res: any) {
    return this.apartadosService.cancel(req, res);
  }

  @Post(':id/entregar')
  entregar(@Req() req: any, @Res() res: any) {
    return this.apartadosService.entregar(req, res);
  }
}
