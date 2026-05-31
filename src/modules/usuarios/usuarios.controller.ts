import { Body, Controller, Delete, Get, Post, Put, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth.guard';
import { RolesGuard } from '../../roles.guard';
import { Roles } from '../../decorators';
import { UsuariosService } from './usuarios.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';

@Controller('api')
@UseGuards(AuthGuard, RolesGuard)
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}
  @Roles('admin')
  @Get('usuarios') findAll(@Req() req: any, @Res() res: any) { return this.usuariosService.findAll(req, res); }
  @Roles('admin')
  @Post('usuarios') create(@Body() _dto: CreateUsuarioDto, @Req() req: any, @Res() res: any) { return this.usuariosService.create(req, res); }
  @Roles('admin')
  @Put('usuarios/:id') update(@Body() _dto: UpdateUsuarioDto, @Req() req: any, @Res() res: any) { return this.usuariosService.update(req, res); }
  @Roles('admin')
  @Delete('usuarios/:id') remove(@Req() req: any, @Res() res: any) { return this.usuariosService.remove(req, res); }
  @Get('roles') roles(@Req() req: any, @Res() res: any) { return this.usuariosService.roles(req, res); }
}
