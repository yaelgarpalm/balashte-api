import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth.guard';
import { RolesGuard } from '../../roles.guard';
import { Roles } from '../../decorators';
import { RespaldosService } from './respaldos.service';

@Controller('api/respaldos')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class RespaldosController {
  constructor(private readonly respaldosService: RespaldosService) {}

  @Get('estado')
  estado(@Res() res: any) {
    return this.respaldosService.estado(res);
  }

  @Get('exportar')
  exportar(@Req() req: any, @Res() res: any) {
    return this.respaldosService.exportar(req, res);
  }

  @Post('restaurar')
  restaurar(@Body() body: any, @Req() req: any, @Res() res: any) {
    return this.respaldosService.restaurar(body, req, res);
  }
}
