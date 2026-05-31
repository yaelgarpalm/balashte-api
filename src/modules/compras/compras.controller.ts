import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth.guard';
import { RolesGuard } from '../../roles.guard';
import { Roles } from '../../decorators';
import { ComprasService } from './compras.service';
import { CreateCompraDto } from './dto/create-compra.dto';
import { RegistrarAbonoCompraDto } from './dto/registrar-abono-compra.dto';

@Controller('api/compras')
@UseGuards(AuthGuard, RolesGuard)
export class ComprasController {
  constructor(private readonly comprasService: ComprasService) {}

  @Get()
  findAll(@Req() req: any, @Res() res: any) { return this.comprasService.findAll(req, res); }

  @Get('alertas')
  alertas(@Req() req: any, @Res() res: any) { return this.comprasService.alertas(req, res); }

  @Roles('admin', 'bodeguero')
  @Post()
  create(@Body() _dto: CreateCompraDto, @Req() req: any, @Res() res: any) {
    return this.comprasService.create(req, res);
  }

  @Get(':id/pagos')
  pagos(@Req() req: any, @Res() res: any) { return this.comprasService.pagos(req, res); }

  @Roles('admin')
  @Post('abono')
  abono(@Body() _dto: RegistrarAbonoCompraDto, @Req() req: any, @Res() res: any) {
    return this.comprasService.abono(req, res);
  }
}
