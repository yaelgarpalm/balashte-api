import { Body, Controller, Delete, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth.guard';
import { RolesGuard } from '../../roles.guard';
import { Roles } from '../../decorators';
import { CreateFormulaProduccionDto } from './dto/create-formula-produccion.dto';
import { CreateLoteProduccionDto } from './dto/create-lote-produccion.dto';
import { ProduccionService } from './produccion.service';

@Controller('api/produccion')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin', 'bodeguero', 'produccion')
export class ProduccionController {
  constructor(private readonly produccionService: ProduccionService) {}

  @Get('formulas')
  findFormulas(@Req() req: any, @Res() res: any) {
    return this.produccionService.findFormulas(req, res);
  }

  @Get('productos/:id/formula')
  findFormulaByProducto(@Param('id') id: string, @Res() res: any) {
    return this.produccionService.findFormulaByProducto(Number(id), res);
  }

  @Post('formulas')
  saveFormula(@Body() _dto: CreateFormulaProduccionDto, @Req() req: any, @Res() res: any) {
    return this.produccionService.saveFormula(req, res);
  }

  @Delete('formulas/:id')
  removeFormula(@Param('id') id: string, @Res() res: any) {
    return this.produccionService.removeFormula(Number(id), res);
  }

  @Post('calcular-costo')
  calcularCosto(@Req() req: any, @Res() res: any) {
    return this.produccionService.calcularCosto(req, res);
  }

  @Get('lotes')
  findLotes(@Req() req: any, @Res() res: any) {
    return this.produccionService.findLotes(req, res);
  }

  @Get('lotes/:id')
  findLote(@Param('id') id: string, @Res() res: any) {
    return this.produccionService.findLote(Number(id), res);
  }

  @Post('lotes')
  createLote(@Body() _dto: CreateLoteProduccionDto, @Req() req: any, @Res() res: any) {
    return this.produccionService.createLote(req, res);
  }
}
