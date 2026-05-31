import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'beneficios' })
export class Beneficio {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  nombre: string;
}
