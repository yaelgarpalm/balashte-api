export class CreateCompraDto {
  proveedor_id: number;
  items: Array<Record<string, any>>;
  [key: string]: any;
}
