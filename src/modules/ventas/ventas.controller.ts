import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth.guard';
import { RolesGuard } from '../../roles.guard';
import { Roles } from '../../decorators';
import { VentasService } from './ventas.service';
import { CreateVentaDto } from './dto/create-venta.dto';

@Controller('api/ventas')
@UseGuards(AuthGuard, RolesGuard)
export class VentasController {
  constructor(private readonly ventasService: VentasService) {}

  @Get()
  findAll(@Req() req: any, @Res() res: any) {
    return this.ventasService.findAll(req, res);
  }

  @Get(':id')
  findOne(@Req() req: any, @Res() res: any) {
    return this.ventasService.findOne(req, res);
  }

  @Post()
  create(@Body() _dto: CreateVentaDto, @Req() req: any, @Res() res: any) {
    return this.ventasService.create(req, res);
  }

  @Roles('admin')
  @Post(':id/cancelar')
  cancel(@Req() req: any, @Res() res: any) {
    return this.ventasService.cancel(req, res);
  }
}
