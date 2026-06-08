export class CreateFormulaProduccionDto {
  producto_id: number;
  insumos: Array<{ producto_id: number; cantidad: number }>;
  notas?: string;
}
