export class CreateLoteProduccionDto {
  producto_id: number;
  cantidad_producida: number;
  codigo_lote?: string;
  notas?: string;
  insumos?: Array<{ producto_id: number; cantidad: number }>;
}
