import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'cajas' })
export class Caja {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  estado: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  monto_inicial: number;
}
