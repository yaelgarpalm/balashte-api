import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class ComprasService {
  constructor(private readonly dataSource: DataSource) {}

  async findAll(req: any, res: any) {
    const { estado, proveedor_id } = req.query;
    const where = ['c.deleted_at IS NULL'];
    const params: any[] = [];
    if (estado) { where.push('c.estado = ?'); params.push(estado); }
    if (proveedor_id) { where.push('c.proveedor_id = ?'); params.push(proveedor_id); }
    try {
      const compras = await this.dataSource.query(
        `SELECT c.*, p.nombre AS proveedor, u.nombre AS usuario
         FROM compras c JOIN proveedores p ON c.proveedor_id = p.id JOIN usuarios u ON c.usuario_id = u.id
         WHERE ${where.join(' AND ')} ORDER BY c.created_at DESC`,
        params,
      );
      return res.json({ ok: true, compras });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ ok: false, mensaje: 'Error al obtener compras.' });
    }
  }
  async create(req: any, res: any) {
    const { proveedor_id, items, notas, fecha_compra, fecha_vencimiento, metodo_pago, monto_pagado } = req.body;
    if (!proveedor_id || !items || items.length === 0) return res.status(400).json({ ok: false, mensaje: 'Datos incompletos.' });
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const total = items.reduce((acc, item) => acc + (item.cantidad * item.costo_unitario), 0);
      const saldo_pendiente = total - (monto_pagado || 0);
      const estado = saldo_pendiente <= 0 ? 'pagada' : 'pendiente';
      const folio = `COM-${Date.now()}`;
      const compraRes = await queryRunner.query(
        'INSERT INTO compras (proveedor_id, usuario_id, folio, total, saldo_pendiente, estado, notas, fecha_compra, fecha_vencimiento) VALUES (?,?,?,?,?,?,?,?,?)',
        [proveedor_id, req.usuario.id, folio, total, saldo_pendiente, estado, notas, fecha_compra || new Date(), fecha_vencimiento || null],
      );
      const compra_id = compraRes.insertId;
      for (const item of items) {
        await queryRunner.query('INSERT INTO detalle_compras (compra_id, producto_id, cantidad, costo_unitario) VALUES (?,?,?,?)', [compra_id, item.producto_id, item.cantidad, item.costo_unitario]);
        const productos = await queryRunner.query('SELECT stock, precio_compra FROM productos WHERE id = ?', [item.producto_id]);
        const producto = productos[0];
        let nuevoCosto = item.costo_unitario;
        if (producto.stock > 0) nuevoCosto = ((producto.stock * producto.precio_compra) + (item.cantidad * item.costo_unitario)) / (producto.stock + item.cantidad);
        await queryRunner.query('UPDATE productos SET stock = stock + ?, precio_compra = ? WHERE id = ?', [item.cantidad, nuevoCosto, item.producto_id]);
        await queryRunner.query(
          'INSERT INTO movimientos_inventario (producto_id, usuario_id, tipo, cantidad, stock_anterior, stock_nuevo, motivo, compra_id) VALUES (?,?,?,?,?,?,?,?)',
          [item.producto_id, req.usuario.id, 'entrada', item.cantidad, producto.stock, producto.stock + item.cantidad, `Compra folio: ${folio}`, compra_id],
        );
      }
      if (monto_pagado > 0) await queryRunner.query('INSERT INTO pagos_compras (compra_id, usuario_id, monto, metodo_pago, notas) VALUES (?,?,?,?,?)', [compra_id, req.usuario.id, monto_pagado, metodo_pago || 'efectivo', 'Pago inicial al crear compra']);
      await queryRunner.commitTransaction();
      return res.status(201).json({ ok: true, mensaje: 'Compra registrada correctamente.', id: compra_id, folio });
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(error);
      return res.status(500).json({ ok: false, mensaje: 'Error al procesar la compra.' });
    } finally {
      await queryRunner.release();
    }
  }
  async abono(req: any, res: any) {
    const { compra_id, monto, metodo_pago, notas } = req.body;
    if (!compra_id || !monto || monto <= 0) return res.status(400).json({ ok: false, mensaje: 'Monto inválido.' });
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const compras = await queryRunner.query('SELECT saldo_pendiente, total FROM compras WHERE id = ? AND deleted_at IS NULL', [compra_id]);
      const compra = compras[0];
      if (!compra) throw new Error('Compra no encontrada.');
      if (monto > compra.saldo_pendiente) return res.status(400).json({ ok: false, mensaje: `El abono no puede superar el saldo pendiente (${compra.saldo_pendiente}).` });
      await queryRunner.query('INSERT INTO pagos_compras (compra_id, usuario_id, monto, metodo_pago, notas) VALUES (?,?,?,?,?)', [compra_id, req.usuario.id, monto, metodo_pago, notas]);
      const nuevoSaldo = compra.saldo_pendiente - monto;
      const nuevoEstado = nuevoSaldo <= 0 ? 'pagada' : 'pendiente';
      await queryRunner.query('UPDATE compras SET saldo_pendiente = ?, estado = ? WHERE id = ?', [nuevoSaldo, nuevoEstado, compra_id]);
      await queryRunner.commitTransaction();
      return res.json({ ok: true, mensaje: 'Abono registrado correctamente.', nuevoSaldo });
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(error);
      return res.status(500).json({ ok: false, mensaje: 'Error al registrar el abono.' });
    } finally {
      await queryRunner.release();
    }
  }
  async pagos(req: any, res: any) {
    try {
      const pagos = await this.dataSource.query(`SELECT pc.*, u.nombre AS usuario FROM pagos_compras pc JOIN usuarios u ON pc.usuario_id = u.id WHERE pc.compra_id = ? ORDER BY pc.created_at DESC`, [req.params.id]);
      return res.json({ ok: true, pagos });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error interno.' });
    }
  }
  async alertas(req: any, res: any) {
    try {
      const alertas = await this.dataSource.query(
        `SELECT c.id, c.folio, c.saldo_pendiente, c.fecha_vencimiento, p.nombre AS proveedor,
         DATEDIFF(c.fecha_vencimiento, CURDATE()) AS dias_restantes
         FROM compras c JOIN proveedores p ON c.proveedor_id = p.id
         WHERE c.estado = 'pendiente' AND c.deleted_at IS NULL
         AND (c.fecha_vencimiento <= DATE_ADD(CURDATE(), INTERVAL 3 DAY) OR c.fecha_vencimiento < CURDATE())
         ORDER BY c.fecha_vencimiento ASC`,
      );
      return res.json({ ok: true, alertas });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ ok: false, mensaje: 'Error al obtener alertas de compras.' });
    }
  }
}
