import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'gastos' })
export class Gasto {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  monto: number;
}
