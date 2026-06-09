import { Injectable } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';

@Injectable()
export class VentasService {
  constructor(private readonly dataSource: DataSource) {}

  private async generarFolio(queryRunner: DataSource | QueryRunner = this.dataSource) {
    const fecha = new Date();
    const prefijo = `VTA-${fecha.getFullYear()}${String(fecha.getMonth() + 1).padStart(2, '0')}${String(fecha.getDate()).padStart(2, '0')}`;
    const rows = await queryRunner.query('SELECT COUNT(*) as ultimo FROM ventas WHERE folio LIKE ?', [`${prefijo}%`]);
    return `${prefijo}-${String(rows[0].ultimo + 1).padStart(4, '0')}`;
  }

  async findAll(req: any, res: any) {
    const { fecha_inicio, fecha_fin, estado, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const where = ['1=1'];
    const params: any[] = [];
    if (estado) { where.push('v.estado = ?'); params.push(estado); }
    if (fecha_inicio) { where.push('DATE(v.created_at) >= ?'); params.push(fecha_inicio); }
    if (fecha_fin) { where.push('DATE(v.created_at) <= ?'); params.push(fecha_fin); }
    try {
      const ventas = await this.dataSource.query(
        `SELECT v.*, c.nombre AS cliente, u.nombre AS vendedor
         FROM ventas v
         LEFT JOIN clientes c ON v.cliente_id = c.id
         LEFT JOIN usuarios u ON v.usuario_id = u.id
         WHERE ${where.join(' AND ')}
         ORDER BY v.created_at DESC LIMIT ? OFFSET ?`,
        [...params, Number(limit), offset],
      );
      const totalRows = await this.dataSource.query(`SELECT COUNT(*) as total FROM ventas v WHERE ${where.join(' AND ')}`, params);
      return res.json({ ok: true, ventas, total: totalRows[0].total, page: Number(page) });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error interno.' });
    }
  }

  async findOne(req: any, res: any) {
    try {
      const ventas = await this.dataSource.query(
        `SELECT v.*, c.nombre AS cliente, c.email AS cliente_email, c.telefono AS cliente_tel, u.nombre AS vendedor
         FROM ventas v
         LEFT JOIN clientes c ON v.cliente_id = c.id
         LEFT JOIN usuarios u ON v.usuario_id = u.id
         WHERE v.id = ?`,
        [req.params.id],
      );
      const venta = ventas[0];
      if (!venta) return res.status(404).json({ ok: false, mensaje: 'Venta no encontrada.' });
      const detalle = await this.dataSource.query(
        `SELECT dv.*, p.nombre AS producto, p.codigo
         FROM detalle_ventas dv
         JOIN productos p ON dv.producto_id = p.id
         WHERE dv.venta_id = ?`,
        [req.params.id],
      );
      return res.json({ ok: true, venta: { ...venta, detalle } });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error interno.' });
    }
  }

  async create(req: any, res: any) {
    const { cliente_id, items, descuento_global = 0, metodo_pago, monto_pagado, notas, referencia_pago } = req.body;
    if (!items || !items.length) return res.status(400).json({ ok: false, mensaje: 'La venta debe tener al menos un producto.' });
    if (!metodo_pago) return res.status(400).json({ ok: false, mensaje: 'El método de pago es obligatorio.' });
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const cajas = await queryRunner.query("SELECT id FROM cajas WHERE estado = 'abierta' LIMIT 1 FOR UPDATE");
      const caja = cajas[0];
      if (!caja) throw new Error('Debe abrir la caja antes de realizar ventas.');
      let subtotal = 0;
      const itemsValidados: any[] = [];
      for (const item of items) {
        const cantidad = Number(item.cantidad);
        if (!Number.isInteger(cantidad) || cantidad <= 0) throw new Error('La cantidad de cada producto debe ser un entero mayor a 0.');
        const productos = await queryRunner.query("SELECT id, nombre, precio_venta, stock, tipo_producto FROM productos WHERE id = ? AND activo = TRUE AND tipo_producto = 'venta' FOR UPDATE", [item.producto_id]);
        const prod = productos[0];
        if (!prod) throw new Error(`Producto ID ${item.producto_id} no encontrado, inactivo o marcado como insumo.`);
        if (prod.stock < cantidad) throw new Error(`Stock insuficiente para "${prod.nombre}". Disponible: ${prod.stock}`);
        const precioFinal = item.precio_unitario || prod.precio_venta;
        const descItem = item.descuento || 0;
        const subtotalItem = precioFinal * cantidad * (1 - descItem / 100);
        subtotal += subtotalItem;
        itemsValidados.push({ ...item, cantidad, precio_unitario: precioFinal, subtotal: subtotalItem, stock_actual: prod.stock });
      }
      const descuentoMonto = subtotal * (descuento_global / 100);
      const baseIva = subtotal - descuentoMonto;
      const iva = baseIva * 0.16;
      const total = baseIva + iva;
      const cambio = (monto_pagado || 0) - total;
      const folio = await this.generarFolio(queryRunner);
      const ventaResult = await queryRunner.query(
        `INSERT INTO ventas (folio, cliente_id, usuario_id, caja_id, subtotal, descuento, iva, total, metodo_pago, monto_pagado, cambio, notas, referencia_pago)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [folio, cliente_id || 1, req.usuario.id, caja.id, subtotal, descuentoMonto, iva, total, metodo_pago, monto_pagado || total, Math.max(0, cambio), notas || null, referencia_pago || null],
      );
      const ventaId = ventaResult.insertId;
      for (const item of itemsValidados) {
        await queryRunner.query(
          `INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario, descuento, subtotal)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [ventaId, item.producto_id, item.cantidad, item.precio_unitario, item.descuento || 0, item.subtotal],
        );
        const nuevoStock = item.stock_actual - item.cantidad;
        await queryRunner.query('UPDATE productos SET stock = ? WHERE id = ?', [nuevoStock, item.producto_id]);
        await queryRunner.query(
          `INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, stock_anterior, stock_nuevo, motivo, usuario_id, venta_id)
           VALUES (?, 'venta', ?, ?, ?, ?, ?, ?)`,
          [item.producto_id, item.cantidad, item.stock_actual, nuevoStock, `Venta ${folio}`, req.usuario.id, ventaId],
        );
      }
      await queryRunner.commitTransaction();
      return res.status(201).json({ ok: true, mensaje: 'Venta registrada correctamente.', venta: { id: ventaId, folio, total, cambio: Math.max(0, cambio), iva } });
    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      console.error('Error en venta:', error);
      return res.status(400).json({ ok: false, mensaje: error.message });
    } finally {
      await queryRunner.release();
    }
  }

  async cancel(req: any, res: any) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const ventas = await queryRunner.query('SELECT * FROM ventas WHERE id = ? FOR UPDATE', [req.params.id]);
      const venta = ventas[0];
      if (!venta) throw new Error('Venta no encontrada.');
      if (venta.estado === 'cancelada') throw new Error('La venta ya está cancelada.');
      const detalle = await queryRunner.query('SELECT * FROM detalle_ventas WHERE venta_id = ?', [req.params.id]);
      for (const item of detalle) {
        const productos = await queryRunner.query('SELECT stock FROM productos WHERE id = ?', [item.producto_id]);
        const prod = productos[0];
        const nuevoStock = Number(prod.stock) + Number(item.cantidad);
        await queryRunner.query('UPDATE productos SET stock = ? WHERE id = ?', [nuevoStock, item.producto_id]);
        await queryRunner.query(
          `INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, stock_anterior, stock_nuevo, motivo, usuario_id, venta_id)
           VALUES (?, 'devolucion', ?, ?, ?, ?, ?, ?)`,
          [item.producto_id, item.cantidad, prod.stock, nuevoStock, `Cancelación de ${venta.folio}`, req.usuario.id, venta.id],
        );
      }
      await queryRunner.query("UPDATE ventas SET estado = 'cancelada' WHERE id = ?", [req.params.id]);
      await queryRunner.commitTransaction();
      return res.json({ ok: true, mensaje: 'Venta cancelada y stock restaurado.' });
    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      return res.status(400).json({ ok: false, mensaje: error.message });
    } finally {
      await queryRunner.release();
    }
  }
}
