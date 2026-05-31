import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class GastosService {
  constructor(private readonly dataSource: DataSource) {}
  async findAll(req: any, res: any) {
    const { fecha_inicio, fecha_fin, categoria_id, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const where = ['1=1'];
    const params: any[] = [];
    if (categoria_id) { where.push('g.categoria_gasto_id = ?'); params.push(categoria_id); }
    if (fecha_inicio) { where.push('g.fecha >= ?'); params.push(fecha_inicio); }
    if (fecha_fin) { where.push('g.fecha <= ?'); params.push(fecha_fin); }
    try {
      const gastos = await this.dataSource.query(
        `SELECT g.*, cg.nombre as categoria, u.nombre as usuario
         FROM gastos g JOIN categorias_gastos cg ON g.categoria_gasto_id = cg.id JOIN usuarios u ON g.usuario_id = u.id
         WHERE ${where.join(' AND ')} ORDER BY g.fecha DESC, g.created_at DESC LIMIT ? OFFSET ?`,
        [...params, Number(limit), offset],
      );
      const totalRows = await this.dataSource.query(`SELECT COUNT(*) as total FROM gastos g WHERE ${where.join(' AND ')}`, params);
      const sumaRows = await this.dataSource.query(`SELECT SUM(monto) as suma FROM gastos g WHERE ${where.join(' AND ')}`, params);
      return res.json({ ok: true, gastos, total: totalRows[0].total, suma_total: sumaRows[0].suma || 0 });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ ok: false, mensaje: 'Error al obtener gastos.' });
    }
  }
  async create(req: any, res: any) {
    const { categoria_gasto_id, monto, concepto, fecha, metodo_pago, comprobante_url } = req.body;
    if (!categoria_gasto_id || !monto || !concepto || !fecha) return res.status(400).json({ ok: false, mensaje: 'Faltan campos obligatorios.' });
    try {
      const result = await this.dataSource.query(
        `INSERT INTO gastos (categoria_gasto_id, usuario_id, monto, concepto, fecha, metodo_pago, comprobante_url)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [categoria_gasto_id, req.usuario.id, monto, concepto, fecha, metodo_pago || 'efectivo', comprobante_url || null],
      );
      return res.status(201).json({ ok: true, mensaje: 'Gasto registrado correctamente.', id: result.insertId });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ ok: false, mensaje: 'Error al registrar gasto.' });
    }
  }
  async remove(req: any, res: any) {
    try {
      await this.dataSource.query('DELETE FROM gastos WHERE id = ?', [req.params.id]);
      return res.json({ ok: true, mensaje: 'Gasto eliminado.' });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error al eliminar gasto.' });
    }
  }
  async categorias(req: any, res: any) {
    try {
      const categorias = await this.dataSource.query('SELECT * FROM categorias_gastos WHERE activo = TRUE ORDER BY nombre ASC');
      return res.json({ ok: true, categorias });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error al obtener categorías de gastos.' });
    }
  }
  async crearCategoria(req: any, res: any) {
    const { nombre, descripcion } = req.body;
    try {
      const result = await this.dataSource.query('INSERT INTO categorias_gastos (nombre, descripcion) VALUES (?, ?)', [nombre, descripcion]);
      return res.status(201).json({ ok: true, id: result.insertId });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error al crear categoría.' });
    }
  }
}
