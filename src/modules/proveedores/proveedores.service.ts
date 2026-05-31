import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class ProveedoresService {
  constructor(private readonly dataSource: DataSource) {}
  async findAll(req: any, res: any) {
    const { buscar } = req.query;
    const where = ['deleted_at IS NULL'];
    const params: any[] = [];
    if (buscar) { where.push('(nombre LIKE ? OR contacto LIKE ? OR email LIKE ?)'); params.push(`%${buscar}%`, `%${buscar}%`, `%${buscar}%`); }
    try {
      const proveedores = await this.dataSource.query(`SELECT * FROM proveedores WHERE ${where.join(' AND ')} ORDER BY nombre`, params);
      return res.json({ ok: true, proveedores });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error interno.' });
    }
  }
  async findOne(req: any, res: any) {
    try {
      const proveedores = await this.dataSource.query('SELECT * FROM proveedores WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
      const proveedor = proveedores[0];
      if (!proveedor) return res.status(404).json({ ok: false, mensaje: 'Proveedor no encontrado.' });
      const compras = await this.dataSource.query(`SELECT id, folio, total, saldo_pendiente, estado, fecha_compra, created_at FROM compras WHERE proveedor_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 20`, [req.params.id]);
      const resumenRows = await this.dataSource.query(`SELECT COUNT(*) as total_ordenes, COALESCE(SUM(total),0) as total_comprado, COALESCE(SUM(saldo_pendiente),0) as saldo_total FROM compras WHERE proveedor_id = ? AND deleted_at IS NULL AND estado != 'cancelada'`, [req.params.id]);
      return res.json({ ok: true, proveedor: { ...proveedor, compras, resumen: resumenRows[0] } });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ ok: false, mensaje: 'Error al obtener detalle del proveedor.' });
    }
  }
  async create(req: any, res: any) {
    const { nombre, contacto, email, telefono, direccion, rfc, notas } = req.body;
    if (!nombre) return res.status(400).json({ ok: false, mensaje: 'El nombre es obligatorio.' });
    try {
      const result = await this.dataSource.query('INSERT INTO proveedores (nombre, contacto, email, telefono, direccion, rfc, notas) VALUES (?,?,?,?,?,?,?)', [nombre, contacto || null, email || null, telefono || null, direccion || null, rfc || null, notas || null]);
      return res.status(201).json({ ok: true, mensaje: 'Proveedor creado.', id: result.insertId });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error interno.' });
    }
  }
  async update(req: any, res: any) {
    const { nombre, contacto, email, telefono, direccion, rfc, notas, activo } = req.body;
    try {
      await this.dataSource.query('UPDATE proveedores SET nombre=?,contacto=?,email=?,telefono=?,direccion=?,rfc=?,notas=?,activo=? WHERE id=?', [nombre, contacto || null, email || null, telefono || null, direccion || null, rfc || null, notas || null, activo !== undefined ? activo : true, req.params.id]);
      return res.json({ ok: true, mensaje: 'Proveedor actualizado.' });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error interno.' });
    }
  }
  async remove(req: any, res: any) {
    try {
      await this.dataSource.query('UPDATE proveedores SET activo=FALSE, deleted_at=NOW() WHERE id=?', [req.params.id]);
      return res.json({ ok: true, mensaje: 'Proveedor eliminado.' });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error interno.' });
    }
  }
}
