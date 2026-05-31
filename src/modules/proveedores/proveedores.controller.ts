import { Body, Controller, Delete, Get, Post, Put, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth.guard';
import { RolesGuard } from '../../roles.guard';
import { Roles } from '../../decorators';
import { ProveedoresService } from './proveedores.service';
import { CreateProveedorDto } from './dto/create-proveedor.dto';
import { UpdateProveedorDto } from './dto/update-proveedor.dto';

@Controller('api/proveedores')
@UseGuards(AuthGuard, RolesGuard)
export class ProveedoresController {
  constructor(private readonly proveedoresService: ProveedoresService) {}
  @Get() findAll(@Req() req: any, @Res() res: any) { return this.proveedoresService.findAll(req, res); }
  @Get(':id') findOne(@Req() req: any, @Res() res: any) { return this.proveedoresService.findOne(req, res); }
  @Roles('admin', 'bodeguero')
  @Post() create(@Body() _dto: CreateProveedorDto, @Req() req: any, @Res() res: any) { return this.proveedoresService.create(req, res); }
  @Roles('admin', 'bodeguero')
  @Put(':id') update(@Body() _dto: UpdateProveedorDto, @Req() req: any, @Res() res: any) { return this.proveedoresService.update(req, res); }
  @Roles('admin')
  @Delete(':id') remove(@Req() req: any, @Res() res: any) { return this.proveedoresService.remove(req, res); }
}
