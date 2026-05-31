import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth.guard';
import { RolesGuard } from '../../roles.guard';
import { Roles } from '../../decorators';
import { CajaService } from './caja.service';
import { AbrirCajaDto } from './dto/abrir-caja.dto';
import { CerrarCajaDto } from './dto/cerrar-caja.dto';
import { RegistrarMovimientoCajaDto } from './dto/registrar-movimiento-caja.dto';

@Controller('api/caja')
@UseGuards(AuthGuard, RolesGuard)
export class CajaController {
  constructor(private readonly cajaService: CajaService) {}

  @Get('estado')
  estado(@Req() req: any, @Res() res: any) { return this.cajaService.estado(req, res); }

  @Post('abrir')
  abrir(@Body() _dto: AbrirCajaDto, @Req() req: any, @Res() res: any) { return this.cajaService.abrir(req, res); }

  @Post('cerrar')
  cerrar(@Body() _dto: CerrarCajaDto, @Req() req: any, @Res() res: any) { return this.cajaService.cerrar(req, res); }

  @Post('movimiento')
  movimiento(@Body() _dto: RegistrarMovimientoCajaDto, @Req() req: any, @Res() res: any) {
    return this.cajaService.movimiento(req, res);
  }

  @Roles('admin')
  @Get('alertas')
  alertas(@Req() req: any, @Res() res: any) { return this.cajaService.alertas(req, res); }

  @Roles('admin')
  @Get('historial')
  historial(@Req() req: any, @Res() res: any) { return this.cajaService.historial(req, res); }
}
