export class CreateApartadoDto {
  cliente_id: number;
  items: Array<Record<string, any>>;
  anticipo: number;
  metodo_pago?: string;
  fecha_limite?: string;
  [key: string]: any;
}
