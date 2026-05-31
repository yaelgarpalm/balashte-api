import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class ClientesService {
  constructor(private readonly dataSource: DataSource) {}
  async findAll(req: any, res: any) {
    const { buscar, tipo } = req.query;
    const where = ['deleted_at IS NULL'];
    const params: any[] = [];
    if (tipo) { where.push('tipo = ?'); params.push(tipo); }
    if (buscar) { where.push('(nombre LIKE ? OR email LIKE ? OR telefono LIKE ?)'); params.push(`%${buscar}%`, `%${buscar}%`, `%${buscar}%`); }
    try {
      const clientes = await this.dataSource.query(
        `SELECT c.*,
          (SELECT COUNT(*) FROM ventas v WHERE v.cliente_id = c.id AND v.estado='completada') AS total_compras,
          (SELECT COALESCE(SUM(v.total),0) FROM ventas v WHERE v.cliente_id = c.id AND v.estado='completada') AS total_gastado
         FROM clientes c WHERE ${where.join(' AND ')} ORDER BY nombre`,
        params,
      );
      return res.json({ ok: true, clientes });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error interno.' });
    }
  }
  async findOne(req: any, res: any) {
    try {
      const clientes = await this.dataSource.query('SELECT * FROM clientes WHERE id = ?', [req.params.id]);
      const cliente = clientes[0];
      if (!cliente) return res.status(404).json({ ok: false, mensaje: 'Cliente no encontrado.' });
      const compras = await this.dataSource.query(`SELECT v.folio, v.total, v.metodo_pago, v.estado, v.created_at FROM ventas v WHERE v.cliente_id = ? AND estado='completada' ORDER BY v.created_at DESC LIMIT 10`, [req.params.id]);
      const apartados = await this.dataSource.query(`SELECT folio, total, saldo_pendiente, estado, created_at FROM apartados WHERE cliente_id = ? AND estado != 'entregado'`, [req.params.id]);
      const resumenRows = await this.dataSource.query(
        `SELECT
          (SELECT COALESCE(SUM(saldo_pendiente),0) FROM apartados WHERE cliente_id = ? AND estado != 'entregado') as saldo_deudor,
          (SELECT COALESCE(SUM(total),0) FROM ventas WHERE cliente_id = ? AND estado = 'completada') as total_historico,
          (SELECT COUNT(*) FROM ventas WHERE cliente_id = ? AND estado = 'completada') as visitas`,
        [req.params.id, req.params.id, req.params.id],
      );
      return res.json({ ok: true, cliente: { ...cliente, compras, apartados, resumen: resumenRows[0] } });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error interno.' });
    }
  }
  async create(req: any, res: any) {
    const { nombre, email, telefono, direccion, rfc, tipo, descuento_default, notas, regimen_fiscal, codigo_postal, uso_cfdi } = req.body;
    if (!nombre) return res.status(400).json({ ok: false, mensaje: 'El nombre es obligatorio.' });
    try {
      const result = await this.dataSource.query(
        `INSERT INTO clientes (nombre, email, telefono, direccion, rfc, tipo, descuento_default, notas, regimen_fiscal, codigo_postal, uso_cfdi)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [nombre, email || null, telefono || null, direccion || null, rfc || null, tipo || 'publico_general', descuento_default || 0, notas || null, regimen_fiscal || null, codigo_postal || null, uso_cfdi || 'G03'],
      );
      await this.aplicarBeneficiosAutomaticos(result.insertId, 'cliente');
      return res.status(201).json({ ok: true, mensaje: 'Cliente creado.', id: result.insertId });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error al crear cliente.' });
    }
  }
  async update(req: any, res: any) {
    const { nombre, email, telefono, direccion, rfc, tipo, descuento_default, notas, activo, regimen_fiscal, codigo_postal, uso_cfdi } = req.body;
    try {
      await this.dataSource.query(
        `UPDATE clientes SET nombre=?, email=?, telefono=?, direccion=?, rfc=?, tipo=?, descuento_default=?, notas=?, activo=?, regimen_fiscal=?, codigo_postal=?, uso_cfdi=? WHERE id=?`,
        [nombre, email || null, telefono || null, direccion || null, rfc || null, tipo || 'publico_general', descuento_default || 0, notas || null, activo !== undefined ? activo : true, regimen_fiscal || null, codigo_postal || null, uso_cfdi || 'G03', req.params.id],
      );
      return res.json({ ok: true, mensaje: 'Cliente actualizado.' });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error interno.' });
    }
  }
  async remove(req: any, res: any) {
    try {
      await this.dataSource.query('UPDATE clientes SET activo=FALSE, deleted_at=NOW() WHERE id=?', [req.params.id]);
      return res.json({ ok: true, mensaje: 'Cliente eliminado.' });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error interno.' });
    }
  }
  private async aplicarBeneficiosAutomaticos(entidadId: number, entidadType: string) {
    const beneficios = await this.dataSource.query('SELECT id FROM beneficios WHERE target_type = ? AND is_automatic = TRUE AND activo = TRUE AND deleted_at IS NULL', [entidadType]);
    for (const b of beneficios) {
      await this.dataSource.query('INSERT IGNORE INTO beneficios_asignados (beneficio_id, entidad_id, entidad_type) VALUES (?, ?, ?)', [b.id, entidadId, entidadType]);
    }
  }
}
