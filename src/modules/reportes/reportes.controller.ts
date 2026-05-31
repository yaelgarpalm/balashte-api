import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth.guard';
import { RolesGuard } from '../../roles.guard';
import { Roles } from '../../decorators';
import { ReportesService } from './reportes.service';

@Controller('api')
@UseGuards(AuthGuard, RolesGuard)
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}
  @Get('dashboard') dashboard(@Req() req: any, @Res() res: any) { return this.reportesService.dashboard(req, res); }
  @Roles('admin')
  @Get('reportes/ventas') ventas(@Req() req: any, @Res() res: any) { return this.reportesService.ventas(req, res); }
  @Roles('admin')
  @Get('reportes/usuarios') usuarios(@Req() req: any, @Res() res: any) { return this.reportesService.usuarios(req, res); }
  @Roles('admin')
  @Get('reportes/clientes') clientes(@Req() req: any, @Res() res: any) { return this.reportesService.clientes(req, res); }
}
