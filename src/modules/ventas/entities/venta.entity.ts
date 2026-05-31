import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'ventas' })
export class Venta {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  folio: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  total: number;

  @Column({ default: 'completada' })
  estado: string;
}
