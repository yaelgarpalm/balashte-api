import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'productos' })
export class Producto {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  codigo: string;

  @Column()
  nombre: string;

  @Column({ default: 'venta' })
  tipo_producto: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  precio_venta: number;

  @Column({ type: 'int', default: 0 })
  stock: number;

  @Column({ type: 'boolean', default: true })
  activo: boolean;
}
