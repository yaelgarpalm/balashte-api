import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class BeneficiosService {
  constructor(private readonly dataSource: DataSource) {}
  async findAll(req: any, res: any) {
    try {
      const beneficios = await this.dataSource.query('SELECT * FROM beneficios WHERE deleted_at IS NULL ORDER BY nombre');
      return res.json({ ok: true, beneficios });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error al obtener beneficios.' });
    }
  }
  async create(req: any, res: any) {
    const { nombre, descripcion, tipo, valor, target_type, is_automatic } = req.body;
    if (!nombre || !tipo || !valor || !target_type) return res.status(400).json({ ok: false, mensaje: 'Faltan campos obligatorios.' });
    try {
      const result = await this.dataSource.query('INSERT INTO beneficios (nombre, descripcion, tipo, valor, target_type, is_automatic) VALUES (?, ?, ?, ?, ?, ?)', [nombre, descripcion || null, tipo, valor, target_type, is_automatic || false]);
      return res.status(201).json({ ok: true, mensaje: 'Beneficio creado.', id: result.insertId });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error al crear beneficio.' });
    }
  }
  async update(req: any, res: any) {
    const { nombre, descripcion, tipo, valor, target_type, activo, is_automatic } = req.body;
    try {
      await this.dataSource.query('UPDATE beneficios SET nombre=?, descripcion=?, tipo=?, valor=?, target_type=?, activo=?, is_automatic=? WHERE id=?', [nombre, descripcion || null, tipo, valor, target_type, activo !== undefined ? activo : true, is_automatic || false, req.params.id]);
      return res.json({ ok: true, mensaje: 'Beneficio actualizado.' });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error al actualizar beneficio.' });
    }
  }
  async remove(req: any, res: any) {
    try {
      await this.dataSource.query('UPDATE beneficios SET deleted_at = NOW(), activo = FALSE WHERE id = ?', [req.params.id]);
      return res.json({ ok: true, mensaje: 'Beneficio eliminado.' });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error al eliminar beneficio.' });
    }
  }
  async asignaciones(req: any, res: any) {
    const { type, id } = req.params;
    try {
      const asignaciones = await this.dataSource.query(`SELECT b.* FROM beneficios b JOIN beneficios_asignados ba ON b.id = ba.beneficio_id WHERE ba.entidad_type = ? AND ba.entidad_id = ? AND b.deleted_at IS NULL`, [type, id]);
      return res.json({ ok: true, asignaciones });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error al obtener asignaciones.' });
    }
  }
  async asignar(req: any, res: any) {
    const { beneficio_id, entidad_id, entidad_type } = req.body;
    try {
      const exist = await this.dataSource.query('SELECT id FROM beneficios_asignados WHERE beneficio_id = ? AND entidad_id = ? AND entidad_type = ?', [beneficio_id, entidad_id, entidad_type]);
      if (exist[0]) return res.status(400).json({ ok: false, mensaje: 'El beneficio ya está asignado.' });
      await this.dataSource.query('INSERT INTO beneficios_asignados (beneficio_id, entidad_id, entidad_type) VALUES (?, ?, ?)', [beneficio_id, entidad_id, entidad_type]);
      return res.json({ ok: true, mensaje: 'Beneficio asignado correctamente.' });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error al asignar beneficio.' });
    }
  }
  async desasignar(req: any, res: any) {
    const { beneficio_id, entidad_id, entidad_type } = req.body;
    try {
      await this.dataSource.query('DELETE FROM beneficios_asignados WHERE beneficio_id = ? AND entidad_id = ? AND entidad_type = ?', [beneficio_id, entidad_id, entidad_type]);
      return res.json({ ok: true, mensaje: 'Beneficio desasignado correctamente.' });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error al desasignar beneficio.' });
    }
  }
}
