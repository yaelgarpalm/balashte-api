import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

type InsumoInput = { producto_id: number; cantidad: number };

@Injectable()
export class ProduccionService {
  constructor(private readonly dataSource: DataSource) {}

  private normalizeInsumos(insumos: InsumoInput[] = []) {
    return insumos
      .map((item) => ({
        producto_id: Number(item.producto_id),
        cantidad: Number(item.cantidad),
      }))
      .filter((item) => Number.isInteger(item.producto_id) && item.producto_id > 0 && item.cantidad > 0);
  }

  private async getFormulaInsumos(productoId: number, queryRunner?: any) {
    const runner = queryRunner || this.dataSource;
    return runner.query(
      `SELECT fi.producto_insumo_id AS producto_id, fi.cantidad
       FROM produccion_formulas f
       JOIN produccion_formula_insumos fi ON fi.formula_id = f.id
       WHERE f.producto_id = ? AND f.activo = TRUE
       ORDER BY fi.id ASC`,
      [productoId],
    );
  }

  private async calcularInsumos(insumos: InsumoInput[], queryRunner?: any) {
    const runner = queryRunner || this.dataSource;
    const normalized = this.normalizeInsumos(insumos);
    if (!normalized.length) throw new Error('Agrega al menos un insumo con cantidad mayor a 0.');

    const detalle = [];
    for (const item of normalized) {
      const rows = await runner.query(
        `SELECT id, codigo, nombre, precio_compra, stock, unidad, tipo_producto
         FROM productos
         WHERE id = ? AND activo = TRUE AND deleted_at IS NULL AND tipo_producto = 'insumo'`,
        [item.producto_id],
      );
      const producto = rows[0];
      if (!producto) throw new Error(`Insumo ${item.producto_id} no encontrado o no marcado como insumo.`);
      const costoUnitario = Number(producto.precio_compra || 0);
      const subtotal = item.cantidad * costoUnitario;
      detalle.push({
        producto_id: item.producto_id,
        codigo: producto.codigo,
        nombre: producto.nombre,
        unidad: producto.unidad,
        cantidad: item.cantidad,
        stock: Number(producto.stock || 0),
        costo_unitario: costoUnitario,
        subtotal,
      });
    }

    const costoTotal = detalle.reduce((acc, item) => acc + item.subtotal, 0);
    return { insumos: detalle, costo_total: costoTotal };
  }

  async findFormulas(req: any, res: any) {
    const { buscar } = req.query;
    const params: any[] = [];
    const where = ['f.activo = TRUE', 'p.deleted_at IS NULL'];
    if (buscar) {
      where.push('(p.nombre LIKE ? OR p.codigo LIKE ?)');
      params.push(`%${buscar}%`, `%${buscar}%`);
    }

    try {
      const formulas = await this.dataSource.query(
        `SELECT f.*, p.nombre AS producto, p.codigo AS producto_codigo, p.precio_compra, p.precio_venta,
          COALESCE(SUM(fi.cantidad * pi.precio_compra), 0) AS costo_estimado,
          COUNT(fi.id) AS total_insumos
         FROM produccion_formulas f
         JOIN productos p ON p.id = f.producto_id
         LEFT JOIN produccion_formula_insumos fi ON fi.formula_id = f.id
         LEFT JOIN productos pi ON pi.id = fi.producto_insumo_id
         WHERE ${where.join(' AND ')}
         GROUP BY f.id, p.nombre, p.codigo, p.precio_compra, p.precio_venta
         ORDER BY p.nombre ASC`,
        params,
      );
      return res.json({ ok: true, formulas });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ ok: false, mensaje: 'Error al obtener fórmulas de producción.' });
    }
  }

  async findFormulaByProducto(productoId: number, res: any) {
    try {
      const formulas = await this.dataSource.query(
        `SELECT f.*, p.nombre AS producto, p.codigo AS producto_codigo
         FROM produccion_formulas f
         JOIN productos p ON p.id = f.producto_id
         WHERE f.producto_id = ? AND f.activo = TRUE`,
        [productoId],
      );
      if (!formulas.length) return res.json({ ok: true, formula: null, insumos: [], costo_total: 0 });

      const insumos = await this.dataSource.query(
        `SELECT fi.*, pi.codigo, pi.nombre, pi.unidad, pi.precio_compra, pi.stock,
          (fi.cantidad * pi.precio_compra) AS subtotal
         FROM produccion_formula_insumos fi
         JOIN productos pi ON pi.id = fi.producto_insumo_id
         WHERE fi.formula_id = ?
         ORDER BY fi.id ASC`,
        [formulas[0].id],
      );
      const costoTotal = insumos.reduce((acc, item) => acc + Number(item.subtotal || 0), 0);
      return res.json({ ok: true, formula: formulas[0], insumos, costo_total: costoTotal });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ ok: false, mensaje: 'Error al obtener fórmula.' });
    }
  }

  async saveFormula(req: any, res: any) {
    const { producto_id, insumos, notas } = req.body;
    const productoId = Number(producto_id);
    const normalized = this.normalizeInsumos(insumos);
    if (!productoId || !normalized.length) {
      return res.status(400).json({ ok: false, mensaje: 'Producto e insumos son obligatorios.' });
    }
    if (normalized.some((item) => item.producto_id === productoId)) {
      return res.status(400).json({ ok: false, mensaje: 'El producto terminado no puede ser insumo de sí mismo.' });
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const producto = await queryRunner.query("SELECT id FROM productos WHERE id = ? AND deleted_at IS NULL AND activo = TRUE AND tipo_producto = 'venta'", [productoId]);
      if (!producto.length) throw new Error('Producto terminado no encontrado o no marcado como producto de venta.');
      const calculo = await this.calcularInsumos(normalized, queryRunner);

      await queryRunner.query('UPDATE produccion_formulas SET activo = FALSE WHERE producto_id = ? AND activo = TRUE', [productoId]);
      const formulaRes = await queryRunner.query(
        'INSERT INTO produccion_formulas (producto_id, notas, usuario_id) VALUES (?, ?, ?)',
        [productoId, notas || null, req.usuario.id],
      );
      const formulaId = formulaRes.insertId;
      for (const item of normalized) {
        await queryRunner.query(
          'INSERT INTO produccion_formula_insumos (formula_id, producto_insumo_id, cantidad) VALUES (?, ?, ?)',
          [formulaId, item.producto_id, item.cantidad],
        );
      }
      await queryRunner.query('UPDATE productos SET precio_compra = ? WHERE id = ?', [calculo.costo_total, productoId]);

      await queryRunner.commitTransaction();
      return res.status(201).json({ ok: true, mensaje: 'Fórmula guardada.', id: formulaId, costo_unitario: calculo.costo_total });
    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      console.error(error);
      return res.status(400).json({ ok: false, mensaje: error.message || 'Error al guardar fórmula.' });
    } finally {
      await queryRunner.release();
    }
  }

  async removeFormula(formulaId: number, res: any) {
    try {
      const result = await this.dataSource.query('UPDATE produccion_formulas SET activo = FALSE WHERE id = ?', [formulaId]);
      if (!result.affectedRows) return res.status(404).json({ ok: false, mensaje: 'Fórmula no encontrada.' });
      return res.json({ ok: true, mensaje: 'Fórmula desactivada.' });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error al desactivar fórmula.' });
    }
  }

  async calcularCosto(req: any, res: any) {
    try {
      let insumos = this.normalizeInsumos(req.body.insumos);
      const productoId = Number(req.body.producto_id || 0);
      if (!insumos.length && productoId) insumos = await this.getFormulaInsumos(productoId);
      const resultado = await this.calcularInsumos(insumos);
      const cantidadProducida = Number(req.body.cantidad_producida || 1);
      return res.json({
        ok: true,
        ...resultado,
        costo_unitario_produccion: cantidadProducida > 0 ? resultado.costo_total / cantidadProducida : resultado.costo_total,
      });
    } catch (error: any) {
      return res.status(400).json({ ok: false, mensaje: error.message || 'No se pudo calcular el costo.' });
    }
  }

  async findLotes(req: any, res: any) {
    const { buscar, estado, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const where = ['1=1'];
    const params: any[] = [];
    if (estado) { where.push('l.estado = ?'); params.push(estado); }
    if (buscar) {
      where.push('(l.codigo_lote LIKE ? OR p.nombre LIKE ? OR p.codigo LIKE ?)');
      params.push(`%${buscar}%`, `%${buscar}%`, `%${buscar}%`);
    }

    try {
      const lotes = await this.dataSource.query(
        `SELECT l.*, p.nombre AS producto, p.codigo AS producto_codigo, u.nombre AS usuario
         FROM lotes_produccion l
         JOIN productos p ON p.id = l.producto_id
         LEFT JOIN usuarios u ON u.id = l.usuario_id
         WHERE ${where.join(' AND ')}
         ORDER BY l.created_at DESC LIMIT ? OFFSET ?`,
        [...params, Number(limit), offset],
      );
      const totalRows = await this.dataSource.query(
        `SELECT COUNT(*) AS total
         FROM lotes_produccion l
         JOIN productos p ON p.id = l.producto_id
         WHERE ${where.join(' AND ')}`,
        params,
      );
      return res.json({ ok: true, lotes, total: totalRows[0].total, page: Number(page), limit: Number(limit) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ ok: false, mensaje: 'Error al obtener lotes.' });
    }
  }

  async findLote(loteId: number, res: any) {
    try {
      const lotes = await this.dataSource.query(
        `SELECT l.*, p.nombre AS producto, p.codigo AS producto_codigo, u.nombre AS usuario
         FROM lotes_produccion l
         JOIN productos p ON p.id = l.producto_id
         LEFT JOIN usuarios u ON u.id = l.usuario_id
         WHERE l.id = ?`,
        [loteId],
      );
      if (!lotes.length) return res.status(404).json({ ok: false, mensaje: 'Lote no encontrado.' });
      const insumos = await this.dataSource.query(
        `SELECT li.*, p.nombre, p.codigo, p.unidad
         FROM lotes_produccion_insumos li
         JOIN productos p ON p.id = li.producto_insumo_id
         WHERE li.lote_id = ?
         ORDER BY li.id ASC`,
        [loteId],
      );
      return res.json({ ok: true, lote: lotes[0], insumos });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error al obtener lote.' });
    }
  }

  async createLote(req: any, res: any) {
    const { producto_id, cantidad_producida, codigo_lote, notas } = req.body;
    const productoId = Number(producto_id);
    const cantidadProducida = Number(cantidad_producida);
    if (!productoId || !cantidadProducida || cantidadProducida <= 0) {
      return res.status(400).json({ ok: false, mensaje: 'Producto y cantidad producida son obligatorios.' });
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      let insumos = this.normalizeInsumos(req.body.insumos);
      if (!insumos.length) insumos = await this.getFormulaInsumos(productoId, queryRunner);
      if (!insumos.length) throw new Error('El producto no tiene fórmula de producción registrada.');
      if (insumos.some((item) => item.producto_id === productoId)) throw new Error('El producto terminado no puede consumirse como insumo.');

      const productoRows = await queryRunner.query("SELECT id, stock FROM productos WHERE id = ? AND activo = TRUE AND deleted_at IS NULL AND tipo_producto = 'venta' FOR UPDATE", [productoId]);
      const productoFinal = productoRows[0];
      if (!productoFinal) throw new Error('Producto terminado no encontrado o no marcado como producto de venta.');

      const calculo = await this.calcularInsumos(insumos, queryRunner);
      for (const item of calculo.insumos) {
        const required = item.cantidad * cantidadProducida;
        if (item.stock < required) throw new Error(`Stock insuficiente de ${item.nombre}. Requerido: ${required}, disponible: ${item.stock}.`);
      }

      const costoTotal = calculo.insumos.reduce((acc, item) => acc + (item.subtotal * cantidadProducida), 0);
      const costoUnitario = costoTotal / cantidadProducida;
      const loteCode = codigo_lote || `LOT-${Date.now()}`;
      const loteRes = await queryRunner.query(
        `INSERT INTO lotes_produccion
         (codigo_lote, producto_id, cantidad_producida, costo_total, costo_unitario, estado, notas, usuario_id)
         VALUES (?, ?, ?, ?, ?, 'cerrado', ?, ?)`,
        [loteCode, productoId, cantidadProducida, costoTotal, costoUnitario, notas || null, req.usuario.id],
      );
      const loteId = loteRes.insertId;

      for (const item of calculo.insumos) {
        const required = item.cantidad * cantidadProducida;
        await queryRunner.query(
          `INSERT INTO lotes_produccion_insumos
           (lote_id, producto_insumo_id, cantidad, costo_unitario, subtotal)
           VALUES (?, ?, ?, ?, ?)`,
          [loteId, item.producto_id, required, item.costo_unitario, required * item.costo_unitario],
        );
        const stocks = await queryRunner.query('SELECT stock FROM productos WHERE id = ? FOR UPDATE', [item.producto_id]);
        const stockAnterior = Number(stocks[0].stock || 0);
        const stockNuevo = stockAnterior - required;
        await queryRunner.query('UPDATE productos SET stock = ? WHERE id = ?', [stockNuevo, item.producto_id]);
        await queryRunner.query(
          `INSERT INTO movimientos_inventario
           (producto_id, usuario_id, tipo, cantidad, stock_anterior, stock_nuevo, motivo, costo_unitario, lote_produccion_id)
           VALUES (?, ?, 'salida', ?, ?, ?, ?, ?, ?)`,
          [item.producto_id, req.usuario.id, required, stockAnterior, stockNuevo, `Consumo en lote ${loteCode}`, item.costo_unitario, loteId],
        );
      }

      const stockAnteriorFinal = Number(productoFinal.stock || 0);
      const stockNuevoFinal = stockAnteriorFinal + cantidadProducida;
      await queryRunner.query('UPDATE productos SET stock = ?, precio_compra = ? WHERE id = ?', [stockNuevoFinal, costoUnitario, productoId]);
      await queryRunner.query(
        `INSERT INTO movimientos_inventario
         (producto_id, usuario_id, tipo, cantidad, stock_anterior, stock_nuevo, motivo, costo_unitario, lote_produccion_id)
         VALUES (?, ?, 'entrada', ?, ?, ?, ?, ?, ?)`,
        [productoId, req.usuario.id, cantidadProducida, stockAnteriorFinal, stockNuevoFinal, `Producción lote ${loteCode}`, costoUnitario, loteId],
      );

      await queryRunner.commitTransaction();
      return res.status(201).json({
        ok: true,
        mensaje: 'Lote de producción registrado.',
        id: loteId,
        codigo_lote: loteCode,
        costo_total: costoTotal,
        costo_unitario: costoUnitario,
        stock_nuevo: stockNuevoFinal,
      });
    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      console.error(error);
      return res.status(400).json({ ok: false, mensaje: error.message || 'Error al registrar lote.' });
    } finally {
      await queryRunner.release();
    }
  }
}
