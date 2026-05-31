import { Body, Controller, Delete, Get, Post, Put, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth.guard';
import { RolesGuard } from '../../roles.guard';
import { Roles } from '../../decorators';
import { ClientesService } from './clientes.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';

@Controller('api/clientes')
@UseGuards(AuthGuard, RolesGuard)
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}
  @Get() findAll(@Req() req: any, @Res() res: any) { return this.clientesService.findAll(req, res); }
  @Get(':id') findOne(@Req() req: any, @Res() res: any) { return this.clientesService.findOne(req, res); }
  @Post() create(@Body() _dto: CreateClienteDto, @Req() req: any, @Res() res: any) { return this.clientesService.create(req, res); }
  @Put(':id') update(@Body() _dto: UpdateClienteDto, @Req() req: any, @Res() res: any) { return this.clientesService.update(req, res); }
  @Roles('admin')
  @Delete(':id') remove(@Req() req: any, @Res() res: any) { return this.clientesService.remove(req, res); }
}
