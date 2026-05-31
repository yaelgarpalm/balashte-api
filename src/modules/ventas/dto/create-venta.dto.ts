export class VentaItemDto {
  producto_id: number;
  cantidad: number;
  precio_unitario: number;
  descuento?: number;
}

export class CreateVentaDto {
  cliente_id?: number;
  items: VentaItemDto[];
  descuento_global?: number;
  metodo_pago: string;
  monto_pagado?: number;
  referencia_pago?: string;
}
