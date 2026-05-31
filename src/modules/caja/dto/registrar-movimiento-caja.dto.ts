export class RegistrarMovimientoCajaDto {
  tipo: 'entrada' | 'salida';
  monto: number;
  concepto?: string;
}
