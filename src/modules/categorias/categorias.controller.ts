import { Body, Controller, Delete, Get, Post, Put, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth.guard';
import { RolesGuard } from '../../roles.guard';
import { Roles } from '../../decorators';
import { CategoriasService } from './categorias.service';
import { CreateCategoriaDto } from './dto/create-categoria.dto';
import { UpdateCategoriaDto } from './dto/update-categoria.dto';

@Controller('api/categorias')
@UseGuards(AuthGuard, RolesGuard)
export class CategoriasController {
  constructor(private readonly categoriasService: CategoriasService) {}
  @Get() findAll(@Req() req: any, @Res() res: any) { return this.categoriasService.findAll(req, res); }
  @Roles('admin')
  @Post() create(@Body() _dto: CreateCategoriaDto, @Req() req: any, @Res() res: any) { return this.categoriasService.create(req, res); }
  @Roles('admin')
  @Put(':id') update(@Body() _dto: UpdateCategoriaDto, @Req() req: any, @Res() res: any) { return this.categoriasService.update(req, res); }
  @Roles('admin')
  @Delete(':id') remove(@Req() req: any, @Res() res: any) { return this.categoriasService.remove(req, res); }
}
