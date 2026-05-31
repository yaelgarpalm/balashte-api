import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'compras' })
export class Compra {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  folio: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  total: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  saldo_pendiente: number;
}
