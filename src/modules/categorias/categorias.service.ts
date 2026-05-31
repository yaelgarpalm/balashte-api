import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class CategoriasService {
  constructor(private readonly dataSource: DataSource) {}
  async findAll(req: any, res: any) {
    try {
      const categorias = await this.dataSource.query(`SELECT c.*, COUNT(p.id) AS total_productos FROM categorias c LEFT JOIN productos p ON p.categoria_id = c.id AND p.deleted_at IS NULL WHERE c.deleted_at IS NULL GROUP BY c.id ORDER BY c.nombre`);
      return res.json({ ok: true, categorias });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error interno.' });
    }
  }
  async create(req: any, res: any) {
    const { nombre, descripcion } = req.body;
    if (!nombre) return res.status(400).json({ ok: false, mensaje: 'El nombre es obligatorio.' });
    try {
      const result = await this.dataSource.query('INSERT INTO categorias (nombre, descripcion) VALUES (?,?)', [nombre, descripcion || null]);
      return res.status(201).json({ ok: true, mensaje: 'Categoría creada.', id: result.insertId });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error interno.' });
    }
  }
  async update(req: any, res: any) {
    const { nombre, descripcion, activo } = req.body;
    try {
      await this.dataSource.query('UPDATE categorias SET nombre=?, descripcion=?, activo=? WHERE id=?', [nombre, descripcion || null, activo !== undefined ? activo : true, req.params.id]);
      return res.json({ ok: true, mensaje: 'Categoría actualizada.' });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error interno.' });
    }
  }
  async remove(req: any, res: any) {
    try {
      await this.dataSource.query('UPDATE categorias SET activo=FALSE, deleted_at=NOW() WHERE id=?', [req.params.id]);
      return res.json({ ok: true, mensaje: 'Categoría eliminada.' });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error interno.' });
    }
  }
}
