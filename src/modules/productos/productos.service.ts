import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { promises as fs } from 'fs';
import { join } from 'path';
import { getSupabaseAdminClient, PRODUCT_IMAGES_BUCKET } from '../../supabase-storage';

@Injectable()
export class ProductosService {
  constructor(private readonly dataSource: DataSource) {}

  async subirImagen(body: any, req: any, res: any) {
    const { imagen, nombre } = body;
    const match = /^data:image\/(png|jpe?g|webp);base64,(.+)$/i.exec(imagen || '');

    if (!match) {
      return res.status(400).json({ ok: false, mensaje: 'La imagen debe ser PNG, JPG o WEBP.' });
    }

    const extension = match[1].toLowerCase().replace('jpeg', 'jpg');
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > 2 * 1024 * 1024) {
      return res.status(400).json({ ok: false, mensaje: 'La imagen debe pesar menos de 2MB.' });
    }

    try {
      const safeName = String(nombre || 'producto').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'producto';
      const fileName = `${Date.now()}-${safeName}.${extension}`;
      const supabase = getSupabaseAdminClient();

      if (supabase) {
        const filePath = `productos/${fileName}`;
        const { error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).upload(filePath, buffer, {
          contentType: `image/${extension === 'jpg' ? 'jpeg' : extension}`,
          cacheControl: '31536000',
          upsert: false,
        });

        if (error) {
          console.error(error);
          return res.status(500).json({ ok: false, mensaje: 'Error al subir la imagen a Supabase Storage.' });
        }

        const { data } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(filePath);
        return res.status(201).json({ ok: true, imagen_url: data.publicUrl, storage_path: filePath });
      }

      const uploadDir = join(process.cwd(), 'uploads', 'productos');
      await fs.mkdir(uploadDir, { recursive: true });
      await fs.writeFile(join(uploadDir, fileName), buffer);
      return res.status(201).json({ ok: true, imagen_url: `/uploads/productos/${fileName}` });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ ok: false, mensaje: 'Error al guardar la imagen.' });
    }
  }

  async findAll(req: any, res: any) {
    const { buscar, categoria_id, activo = 'true', page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const where = ['p.deleted_at IS NULL'];
    const params: any[] = [];
    if (activo !== 'todos') { where.push('p.activo = ?'); params.push(activo === 'true'); }
    if (categoria_id) { where.push('p.categoria_id = ?'); params.push(categoria_id); }
    if (buscar) { where.push('(p.nombre LIKE ? OR p.codigo LIKE ? OR p.descripcion LIKE ?)'); params.push(`%${buscar}%`, `%${buscar}%`, `%${buscar}%`); }
    try {
      const productos = await this.dataSource.query(
        `SELECT p.*, c.nombre AS categoria, pr.nombre AS proveedor
         FROM productos p
         LEFT JOIN categorias c ON p.categoria_id = c.id
         LEFT JOIN proveedores pr ON p.proveedor_id = pr.id
         WHERE ${where.join(' AND ')}
         ORDER BY p.nombre ASC LIMIT ? OFFSET ?`,
        [...params, Number(limit), offset],
      );
      const totalRows = await this.dataSource.query(`SELECT COUNT(*) as total FROM productos p WHERE ${where.join(' AND ')}`, params);
      return res.json({ ok: true, productos, total: totalRows[0].total, page: Number(page), limit: Number(limit) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ ok: false, mensaje: 'Error al obtener productos.' });
    }
  }

  async findOne(req: any, res: any) {
    try {
      const rows = await this.dataSource.query(
        `SELECT p.*, c.nombre AS categoria, pr.nombre AS proveedor
         FROM productos p
         LEFT JOIN categorias c ON p.categoria_id = c.id
         LEFT JOIN proveedores pr ON p.proveedor_id = pr.id
         WHERE p.id = ?`,
        [req.params.id],
      );
      if (!rows.length) return res.status(404).json({ ok: false, mensaje: 'Producto no encontrado.' });
      return res.json({ ok: true, producto: rows[0] });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error interno.' });
    }
  }

  async create(req: any, res: any) {
    const { codigo, nombre, descripcion, categoria_id, proveedor_id, precio_compra, precio_venta, stock, stock_minimo, unidad, imagen_url, codigo_sat, unidad_sat } = req.body;
    if (!codigo || !nombre || !categoria_id || !precio_venta) return res.status(400).json({ ok: false, mensaje: 'Código, nombre, categoría y precio de venta son obligatorios.' });
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const result = await queryRunner.query(
        `INSERT INTO productos (codigo, nombre, descripcion, categoria_id, proveedor_id, precio_compra, precio_venta, stock, stock_minimo, unidad, imagen_url, codigo_sat, unidad_sat)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [codigo, nombre, descripcion || null, categoria_id, proveedor_id || null, precio_compra || 0, precio_venta, stock || 0, stock_minimo || 5, unidad || 'pieza', imagen_url || null, codigo_sat || '01010101', unidad_sat || 'H87'],
      );
      if (Number(stock) > 0) {
        await queryRunner.query(
          `INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, stock_anterior, stock_nuevo, motivo, usuario_id)
           VALUES (?, 'entrada', ?, 0, ?, 'Stock inicial al crear producto', ?)`,
          [result.insertId, stock, stock, req.usuario.id],
        );
      }
      await queryRunner.commitTransaction();
      return res.status(201).json({ ok: true, mensaje: 'Producto creado correctamente.', id: result.insertId });
    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ ok: false, mensaje: 'El código de producto ya existe.' });
      console.error(error);
      return res.status(500).json({ ok: false, mensaje: 'Error al crear producto.' });
    } finally {
      await queryRunner.release();
    }
  }

  async update(req: any, res: any) {
    const { nombre, descripcion, categoria_id, proveedor_id, precio_compra, precio_venta, stock_minimo, unidad, imagen_url, activo, codigo_sat, unidad_sat } = req.body;
    try {
      const result = await this.dataSource.query(
        `UPDATE productos SET nombre=?, descripcion=?, categoria_id=?, proveedor_id=?, precio_compra=?, precio_venta=?, stock_minimo=?, unidad=?, imagen_url=?, activo=?, codigo_sat=?, unidad_sat=? WHERE id = ?`,
        [nombre, descripcion || null, categoria_id, proveedor_id || null, precio_compra || 0, precio_venta, stock_minimo || 5, unidad || 'pieza', imagen_url || null, activo !== undefined ? activo : true, codigo_sat || '01010101', unidad_sat || 'H87', req.params.id],
      );
      if (!result.affectedRows) return res.status(404).json({ ok: false, mensaje: 'Producto no encontrado.' });
      return res.json({ ok: true, mensaje: 'Producto actualizado.' });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error al actualizar producto.' });
    }
  }

  async remove(req: any, res: any) {
    try {
      const result = await this.dataSource.query('UPDATE productos SET activo = FALSE, deleted_at = NOW() WHERE id = ?', [req.params.id]);
      if (!result.affectedRows) return res.status(404).json({ ok: false, mensaje: 'Producto no encontrado.' });
      return res.json({ ok: true, mensaje: 'Producto eliminado (Soft Delete).' });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ ok: false, mensaje: 'Error al eliminar producto.' });
    }
  }

  async ajustarStock(req: any, res: any) {
    const { cantidad, tipo, motivo } = req.body;
    if (!cantidad || !tipo) return res.status(400).json({ ok: false, mensaje: 'Cantidad y tipo son obligatorios.' });
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const productos = await queryRunner.query('SELECT stock FROM productos WHERE id = ? FOR UPDATE', [req.params.id]);
      const producto = productos[0];
      if (!producto) throw new Error('Producto no encontrado');
      let nuevoStock: number;
      if (tipo === 'ajuste') nuevoStock = parseInt(cantidad);
      else if (tipo === 'entrada') nuevoStock = Number(producto.stock) + parseInt(cantidad);
      else {
        nuevoStock = Number(producto.stock) - parseInt(cantidad);
        if (nuevoStock < 0) throw new Error('Stock insuficiente para la salida.');
      }
      await queryRunner.query('UPDATE productos SET stock = ? WHERE id = ?', [nuevoStock, req.params.id]);
      const diferencia = Number(producto.stock) - nuevoStock;
      const sospechoso = (tipo === 'salida' || (tipo === 'ajuste' && nuevoStock < producto.stock)) && (diferencia > 50 || !motivo || motivo.length < 5);
      await queryRunner.query(
        `INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, stock_anterior, stock_nuevo, motivo, usuario_id, sospechoso)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.params.id, tipo, Math.abs(cantidad), producto.stock, nuevoStock, motivo || 'Ajuste manual', req.usuario.id, sospechoso],
      );
      await queryRunner.commitTransaction();
      return res.json({ ok: true, mensaje: 'Stock actualizado.', stock_nuevo: nuevoStock, sospechoso });
    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      return res.status(400).json({ ok: false, mensaje: error.message });
    } finally {
      await queryRunner.release();
    }
  }

  async movimientos(req: any, res: any) {
    try {
      const movimientos = await this.dataSource.query(
        `SELECT m.*, u.nombre AS usuario
         FROM movimientos_inventario m
         LEFT JOIN usuarios u ON m.usuario_id = u.id
         WHERE m.producto_id = ?
         ORDER BY m.created_at DESC LIMIT 50`,
        [req.params.id],
      );
      return res.json({ ok: true, movimientos });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error interno.' });
    }
  }

  async movimientosHistorial(req: any, res: any) {
    const { tipo, buscar, sospechoso, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const where = ['1=1'];
    const params: any[] = [];
    if (tipo) { where.push('m.tipo = ?'); params.push(tipo); }
    if (sospechoso === 'true') where.push('m.sospechoso = TRUE');
    if (buscar) { where.push('(p.nombre LIKE ? OR p.codigo LIKE ? OR m.motivo LIKE ?)'); params.push(`%${buscar}%`, `%${buscar}%`, `%${buscar}%`); }
    try {
      const movimientos = await this.dataSource.query(
        `SELECT m.*, p.nombre AS producto, p.codigo AS producto_codigo, u.nombre AS usuario
         FROM movimientos_inventario m
         JOIN productos p ON m.producto_id = p.id
         LEFT JOIN usuarios u ON m.usuario_id = u.id
         WHERE ${where.join(' AND ')}
         ORDER BY m.created_at DESC LIMIT ? OFFSET ?`,
        [...params, Number(limit), offset],
      );
      const totalRows = await this.dataSource.query(
        `SELECT COUNT(*) as total FROM movimientos_inventario m JOIN productos p ON m.producto_id = p.id WHERE ${where.join(' AND ')}`,
        params,
      );
      return res.json({ ok: true, movimientos, total: totalRows[0].total, page: Number(page), limit: Number(limit) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ ok: false, mensaje: 'Error al obtener historial de movimientos.' });
    }
  }

  async bajoStock(req: any, res: any) {
    try {
      const productos = await this.dataSource.query('SELECT * FROM vista_productos_bajo_stock');
      return res.json({ ok: true, productos, total: productos.length });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error interno.' });
    }
  }
}
