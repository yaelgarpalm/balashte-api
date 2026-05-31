import { Body, Controller, Delete, Get, Post, Put, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth.guard';
import { RolesGuard } from '../../roles.guard';
import { Roles } from '../../decorators';
import { ProductosService } from './productos.service';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';
import { AjusteStockDto } from './dto/ajuste-stock.dto';

@Controller('api')
@UseGuards(AuthGuard, RolesGuard)
export class ProductosController {
  constructor(private readonly productosService: ProductosService) {}

  @Get('productos')
  findAll(@Req() req: any, @Res() res: any) {
    return this.productosService.findAll(req, res);
  }

  @Get('productos/alertas/bajo-stock')
  bajoStock(@Req() req: any, @Res() res: any) {
    return this.productosService.bajoStock(req, res);
  }

  @Get('productos/:id')
  findOne(@Req() req: any, @Res() res: any) {
    return this.productosService.findOne(req, res);
  }

  @Roles('admin', 'bodeguero')
  @Post('productos/imagen')
  subirImagen(@Body() body: any, @Req() req: any, @Res() res: any) {
    return this.productosService.subirImagen(body, req, res);
  }

  @Roles('admin', 'bodeguero')
  @Post('productos')
  create(@Body() _dto: CreateProductoDto, @Req() req: any, @Res() res: any) {
    return this.productosService.create(req, res);
  }

  @Roles('admin', 'bodeguero')
  @Put('productos/:id')
  update(@Body() _dto: UpdateProductoDto, @Req() req: any, @Res() res: any) {
    return this.productosService.update(req, res);
  }

  @Roles('admin')
  @Delete('productos/:id')
  remove(@Req() req: any, @Res() res: any) {
    return this.productosService.remove(req, res);
  }

  @Roles('admin', 'bodeguero')
  @Post('productos/:id/ajuste-stock')
  ajustarStock(@Body() _dto: AjusteStockDto, @Req() req: any, @Res() res: any) {
    return this.productosService.ajustarStock(req, res);
  }

  @Get('productos/:id/movimientos')
  movimientos(@Req() req: any, @Res() res: any) {
    return this.productosService.movimientos(req, res);
  }

  @Roles('admin')
  @Get('movimientos')
  movimientosHistorial(@Req() req: any, @Res() res: any) {
    return this.productosService.movimientosHistorial(req, res);
  }
}
