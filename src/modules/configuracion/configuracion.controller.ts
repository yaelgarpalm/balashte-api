import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth.guard';
import { RolesGuard } from '../../roles.guard';
import { Roles } from '../../decorators';
import { ConfiguracionService } from './configuracion.service';
import { UpdateConfiguracionDto } from './dto/update-configuracion.dto';

@Controller('api/configuracion')
@UseGuards(AuthGuard, RolesGuard)
export class ConfiguracionController {
  constructor(private readonly configuracionService: ConfiguracionService) {}
  @Get() get(@Req() req: any, @Res() res: any) { return this.configuracionService.get(req, res); }
  @Roles('admin')
  @Post() update(@Body() _dto: UpdateConfiguracionDto, @Req() req: any, @Res() res: any) {
    return this.configuracionService.update(req, res);
  }
}
