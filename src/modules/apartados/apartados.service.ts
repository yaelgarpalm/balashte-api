import { Injectable } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';

@Injectable()
export class ApartadosService {
  constructor(private readonly dataSource: DataSource) {}

  private async generarFolio(queryRunner: DataSource | QueryRunner = this.dataSource) {
    const fecha = new Date();
    const prefijo = `APT-${fecha.getFullYear()}${String(fecha.getMonth() + 1).padStart(2, '0')}${String(fecha.getDate()).padStart(2, '0')}`;
    const rows = await queryRunner.query('SELECT COUNT(*) as ultimo FROM apartados WHERE folio LIKE ?', [`${prefijo}%`]);
    return `${prefijo}-${String(rows[0].ultimo + 1).padStart(4, '0')}`;
  }

  async findAll(req: any, res: any) {
    const { estado, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const where = ['1=1'];
    const params: any[] = [];
    if (estado) { where.push('a.estado = ?'); params.push(estado); }
    try {
      const apartados = await this.dataSource.query(
        `SELECT a.*, c.nombre AS cliente, c.telefono AS cliente_tel, u.nombre AS vendedor
         FROM apartados a LEFT JOIN clientes c ON a.cliente_id = c.id LEFT JOIN usuarios u ON a.usuario_id = u.id
         WHERE ${where.join(' AND ')} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
        [...params, Number(limit), offset],
      );
      const totalRows = await this.dataSource.query(`SELECT COUNT(*) as total FROM apartados a WHERE ${where.join(' AND ')}`, params);
      return res.json({ ok: true, apartados, total: totalRows[0].total, page: Number(page) });
    } catch (error) {
      console.error('Error al obtener apartados:', error);
      return res.status(500).json({ ok: false, mensaje: 'Error interno.' });
    }
  }
  async findOne(req: any, res: any) {
    try {
      const rows = await this.dataSource.query(
        `SELECT a.*, c.nombre AS cliente, c.email AS cliente_email, c.telefono AS cliente_tel, u.nombre AS vendedor
         FROM apartados a LEFT JOIN clientes c ON a.cliente_id = c.id LEFT JOIN usuarios u ON a.usuario_id = u.id WHERE a.id = ?`,
        [req.params.id],
      );
      const apartado = rows[0];
      if (!apartado) return res.status(404).json({ ok: false, mensaje: 'Apartado no encontrado.' });
      const detalle = await this.dataSource.query(`SELECT da.*, p.nombre AS producto, p.codigo FROM detalle_apartados da JOIN productos p ON da.producto_id = p.id WHERE da.apartado_id = ?`, [req.params.id]);
      const pagos = await this.dataSource.query(`SELECT pa.*, u.nombre AS registrado_por FROM pagos_apartado pa LEFT JOIN usuarios u ON pa.usuario_id = u.id WHERE pa.apartado_id = ? ORDER BY pa.created_at ASC`, [req.params.id]);
      return res.json({ ok: true, apartado: { ...apartado, detalle, pagos } });
    } catch (error) {
      console.error('Error al obtener apartado:', error);
      return res.status(500).json({ ok: false, mensaje: 'Error interno.' });
    }
  }
  async create(req: any, res: any) {
    const { cliente_id, items, descuento_global = 0, anticipo = 0, metodo_pago = 'efectivo', referencia_pago = null, fecha_limite, notas } = req.body;
    if (!items || !items.length) return res.status(400).json({ ok: false, mensaje: 'El apartado debe tener al menos un producto.' });
    if (!cliente_id) return res.status(400).json({ ok: false, mensaje: 'Debe seleccionar un cliente para el apartado.' });
    if (anticipo <= 0) return res.status(400).json({ ok: false, mensaje: 'Debe registrar un anticipo inicial.' });
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      let subtotal = 0;
      const itemsValidados: any[] = [];
      for (const item of items) {
        const cantidad = Number(item.cantidad);
        if (!Number.isInteger(cantidad) || cantidad <= 0) throw new Error('La cantidad de cada producto debe ser un entero mayor a 0.');
        const productos = await queryRunner.query('SELECT id, nombre, precio_venta, stock FROM productos WHERE id = ? AND activo = TRUE FOR UPDATE', [item.producto_id]);
        const prod = productos[0];
        if (!prod) throw new Error(`Producto ID ${item.producto_id} no encontrado o inactivo.`);
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
      const saldo_pendiente = total - anticipo;
      const folio = await this.generarFolio(queryRunner);
      const estado = saldo_pendiente <= 0.01 ? 'completado' : 'activo';
      const montoEfectivo = Math.min(anticipo, total);
      const apartadoResult = await queryRunner.query(
        `INSERT INTO apartados (folio, cliente_id, usuario_id, subtotal, descuento, iva, total, monto_pagado, saldo_pendiente, estado, fecha_limite, notas)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [folio, cliente_id, req.usuario.id, subtotal, descuentoMonto, iva, total, montoEfectivo, Math.max(0, saldo_pendiente), estado, fecha_limite || null, notas || null],
      );
      const apartadoId = apartadoResult.insertId;
      for (const item of itemsValidados) {
        await queryRunner.query('INSERT INTO detalle_apartados (apartado_id, producto_id, cantidad, precio_unitario, descuento, subtotal) VALUES (?, ?, ?, ?, ?, ?)', [apartadoId, item.producto_id, item.cantidad, item.precio_unitario, item.descuento || 0, item.subtotal]);
        const nuevoStock = item.stock_actual - item.cantidad;
        await queryRunner.query('UPDATE productos SET stock = ? WHERE id = ?', [nuevoStock, item.producto_id]);
        await queryRunner.query('INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, stock_anterior, stock_nuevo, motivo, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?)', [item.producto_id, 'apartado', item.cantidad, item.stock_actual, nuevoStock, `Apartado ${folio}`, req.usuario.id]);
      }
      await queryRunner.query('INSERT INTO pagos_apartado (apartado_id, usuario_id, monto, metodo_pago, referencia_pago, notas) VALUES (?, ?, ?, ?, ?, ?)', [apartadoId, req.usuario.id, montoEfectivo, metodo_pago, referencia_pago, 'Anticipo inicial']);
      await queryRunner.commitTransaction();
      return res.status(201).json({ ok: true, mensaje: 'Apartado creado correctamente.', apartado: { id: apartadoId, folio, total, anticipo, saldo_pendiente: Math.max(0, saldo_pendiente) } });
    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      console.error('Error al crear apartado:', error);
      return res.status(400).json({ ok: false, mensaje: error.message });
    } finally {
      await queryRunner.release();
    }
  }
  async registrarPago(req: any, res: any) {
    const { monto, metodo_pago = 'efectivo', referencia_pago = null, notas } = req.body;
    if (!monto || monto <= 0) return res.status(400).json({ ok: false, mensaje: 'El monto del pago debe ser mayor a 0.' });
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const rows = await queryRunner.query('SELECT * FROM apartados WHERE id = ? FOR UPDATE', [req.params.id]);
      const apartado = rows[0];
      if (!apartado) throw new Error('Apartado no encontrado.');
      if (apartado.estado !== 'activo') throw new Error('Este apartado no está activo.');
      const montoEfectivo = Math.min(monto, apartado.saldo_pendiente);
      const nuevoMontoPagado = Number(apartado.monto_pagado) + montoEfectivo;
      const nuevoSaldo = Number(apartado.total) - nuevoMontoPagado;
      const nuevoEstado = nuevoSaldo <= 0.01 ? 'completado' : 'activo';
      await queryRunner.query('INSERT INTO pagos_apartado (apartado_id, usuario_id, monto, metodo_pago, referencia_pago, notas) VALUES (?, ?, ?, ?, ?, ?)', [apartado.id, req.usuario.id, montoEfectivo, metodo_pago, referencia_pago, notas || null]);
      await queryRunner.query('UPDATE apartados SET monto_pagado = ?, saldo_pendiente = ?, estado = ? WHERE id = ?', [nuevoMontoPagado, Math.max(0, nuevoSaldo), nuevoEstado, apartado.id]);
      await queryRunner.commitTransaction();
      return res.json({ ok: true, mensaje: nuevoEstado === 'completado' ? '¡Apartado liquidado completamente!' : 'Pago registrado correctamente.', apartado: { id: apartado.id, folio: apartado.folio, monto_pagado: nuevoMontoPagado, saldo_pendiente: Math.max(0, nuevoSaldo), estado: nuevoEstado } });
    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      console.error('Error al registrar pago:', error);
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
      const rows = await queryRunner.query('SELECT * FROM apartados WHERE id = ? FOR UPDATE', [req.params.id]);
      const apartado = rows[0];
      if (!apartado) throw new Error('Apartado no encontrado.');
      if (apartado.estado === 'cancelado') throw new Error('El apartado ya está cancelado.');
      if (apartado.estado === 'completado') throw new Error('No se puede cancelar un apartado completado.');
      const detalle = await queryRunner.query('SELECT * FROM detalle_apartados WHERE apartado_id = ?', [req.params.id]);
      for (const item of detalle) {
        const productos = await queryRunner.query('SELECT stock FROM productos WHERE id = ?', [item.producto_id]);
        const prod = productos[0];
        const nuevoStock = Number(prod.stock) + Number(item.cantidad);
        await queryRunner.query('UPDATE productos SET stock = ? WHERE id = ?', [nuevoStock, item.producto_id]);
        await queryRunner.query('INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, stock_anterior, stock_nuevo, motivo, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?)', [item.producto_id, 'devolucion', item.cantidad, prod.stock, nuevoStock, `Cancelación apartado ${apartado.folio}`, req.usuario.id]);
      }
      await queryRunner.query("UPDATE apartados SET estado = 'cancelado' WHERE id = ?", [req.params.id]);
      await queryRunner.commitTransaction();
      return res.json({ ok: true, mensaje: 'Apartado cancelado y stock restaurado.' });
    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      console.error('Error al cancelar apartado:', error);
      return res.status(400).json({ ok: false, mensaje: error.message });
    } finally {
      await queryRunner.release();
    }
  }
  async cuentasPorCobrar(req: any, res: any) {
    try {
      const cuentas = await this.dataSource.query(`SELECT a.id, a.folio, a.total, a.monto_pagado, a.saldo_pendiente, a.fecha_limite, a.created_at, c.nombre AS cliente, c.telefono AS cliente_tel, c.email AS cliente_email FROM apartados a JOIN clientes c ON a.cliente_id = c.id WHERE a.estado = 'activo' AND a.saldo_pendiente > 0 ORDER BY a.saldo_pendiente DESC`);
      const totalRows = await this.dataSource.query(`SELECT COALESCE(SUM(saldo_pendiente), 0) AS total_por_cobrar FROM apartados WHERE estado = 'activo'`);
      const activosRows = await this.dataSource.query(`SELECT COUNT(*) AS total_apartados_activos FROM apartados WHERE estado = 'activo'`);
      const resumenClientes = {};
      for (const c of cuentas) {
        if (!resumenClientes[c.cliente]) resumenClientes[c.cliente] = { cliente: c.cliente, telefono: c.cliente_tel, email: c.cliente_email, total_deuda: 0, apartados: 0 };
        resumenClientes[c.cliente].total_deuda += parseFloat(c.saldo_pendiente);
        resumenClientes[c.cliente].apartados++;
      }
      return res.json({ ok: true, cuentas, resumen_clientes: Object.values(resumenClientes).sort((a: any, b: any) => b.total_deuda - a.total_deuda), total_por_cobrar: parseFloat(totalRows[0].total_por_cobrar), total_apartados_activos: parseInt(activosRows[0].total_apartados_activos) });
    } catch (error) {
      console.error('Error al obtener cuentas por cobrar:', error);
      return res.status(500).json({ ok: false, mensaje: 'Error interno.' });
    }
  }
  async entregar(req: any, res: any) {
    try {
      const rows = await this.dataSource.query('SELECT * FROM apartados WHERE id = ?', [req.params.id]);
      const apartado = rows[0];
      if (!apartado) throw new Error('Apartado no encontrado.');
      if (apartado.estado === 'entregado') throw new Error('El apartado ya ha sido entregado.');
      if (apartado.saldo_pendiente > 0.01) throw new Error('No se puede entregar un apartado que aún tiene saldo pendiente.');
      await this.dataSource.query("UPDATE apartados SET estado = 'entregado' WHERE id = ?", [req.params.id]);
      return res.json({ ok: true, mensaje: 'Productos entregados correctamente.' });
    } catch (error: any) {
      return res.status(400).json({ ok: false, mensaje: error.message });
    }
  }
  async alertas(req: any, res: any) {
    try {
      const pendientesEntrega = await this.dataSource.query(`SELECT a.id, a.folio, a.total, a.estado, c.nombre AS cliente, 'entrega' as tipo_alerta FROM apartados a JOIN clientes c ON a.cliente_id = c.id WHERE a.estado = 'completado'`);
      const porVencer = await this.dataSource.query(`SELECT a.id, a.folio, a.total, a.saldo_pendiente, a.fecha_limite, c.nombre AS cliente, 'proximo' as tipo_alerta FROM apartados a JOIN clientes c ON a.cliente_id = c.id WHERE a.estado = 'activo' AND a.fecha_limite BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 3 DAY)`);
      const vencidos = await this.dataSource.query(`SELECT a.id, a.folio, a.total, a.saldo_pendiente, a.fecha_limite, c.nombre AS cliente, 'vencido' as tipo_alerta FROM apartados a JOIN clientes c ON a.cliente_id = c.id WHERE a.estado = 'activo' AND a.fecha_limite < CURDATE()`);
      return res.json({ ok: true, alertas: [...pendientesEntrega.map(a => ({ ...a, mensaje: 'Listo para entrega', color: 'emerald' })), ...porVencer.map(a => ({ ...a, mensaje: `Vence pronto (${new Date(a.fecha_limite).toLocaleDateString()})`, color: 'amber' })), ...vencidos.map(a => ({ ...a, mensaje: `¡VENCIDO! (${new Date(a.fecha_limite).toLocaleDateString()})`, color: 'rose' }))] });
    } catch (error) {
      console.error('Error al obtener alertas de apartados:', error);
      return res.status(500).json({ ok: false, mensaje: 'Error interno.' });
    }
  }
}
