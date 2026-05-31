export class CreateProductoDto {
  codigo: string;
  nombre: string;
  categoria_id: number;
  precio_venta: number;
  [key: string]: any;
}
