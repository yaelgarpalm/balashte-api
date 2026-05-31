import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth.guard';
import { RolesGuard } from '../../roles.guard';
import { Roles } from '../../decorators';
import { FacturapiService } from './facturapi.service';
import { CrearFacturaDto } from './dto/crear-factura.dto';
import { EnviarFacturaEmailDto } from './dto/enviar-factura-email.dto';

@Controller('api/facturapi')
@UseGuards(AuthGuard, RolesGuard)
export class FacturapiController {
  constructor(private readonly facturapiService: FacturapiService) {}
  @Post('crear-factura')
  crearFactura(@Body() _dto: CrearFacturaDto, @Req() req: any, @Res() res: any) {
    return this.facturapiService.crearFactura(req, res);
  }
  @Get(':factura_id/pdf')
  descargarPdf(@Req() req: any, @Res() res: any) { return this.facturapiService.descargarPdf(req, res); }
  @Get(':factura_id/xml')
  descargarXml(@Req() req: any, @Res() res: any) { return this.facturapiService.descargarXml(req, res); }
  @Post(':factura_id/email')
  enviarEmail(@Body() _dto: EnviarFacturaEmailDto, @Req() req: any, @Res() res: any) {
    return this.facturapiService.enviarEmail(req, res);
  }
  @Roles('admin')
  @Post(':factura_id/cancelar')
  cancelar(@Req() req: any, @Res() res: any) { return this.facturapiService.cancelar(req, res); }
}
