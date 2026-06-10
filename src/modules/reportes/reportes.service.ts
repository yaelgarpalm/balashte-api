import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class ReportesService {
  constructor(private readonly dataSource: DataSource) {}

  async dashboard(_req: any, res: any) {
    try {
      const [ventasHoy] = await this.dataSource.query(`
        SELECT
          COUNT(*) AS total_ventas,
          COALESCE(SUM(total), 0) AS ingresos,
          (
            SELECT COALESCE(SUM(dv.cantidad * p.precio_compra), 0)
            FROM detalle_ventas dv
            JOIN productos p ON dv.producto_id = p.id
            JOIN ventas v2 ON dv.venta_id = v2.id
            WHERE v2.created_at::date = CURRENT_DATE AND v2.estado = 'completada'
          ) AS costo
        FROM ventas
        WHERE created_at::date = CURRENT_DATE AND estado = 'completada'
      `);
      const [{ gastos_hoy }] = await this.dataSource.query(
        `SELECT COALESCE(SUM(monto), 0) AS gastos_hoy FROM gastos WHERE fecha = CURRENT_DATE`,
      );
      ventasHoy.gastos = gastos_hoy;
      ventasHoy.utilidad = ventasHoy.ingresos - ventasHoy.costo - gastos_hoy;

      const [ventasMes] = await this.dataSource.query(`
        SELECT
          COUNT(*) AS total_ventas,
          COALESCE(SUM(total), 0) AS ingresos,
          (
            SELECT COALESCE(SUM(dv.cantidad * p.precio_compra), 0)
            FROM detalle_ventas dv
            JOIN productos p ON dv.producto_id = p.id
            JOIN ventas v2 ON dv.venta_id = v2.id
            WHERE EXTRACT(MONTH FROM v2.created_at) = EXTRACT(MONTH FROM CURRENT_DATE)
              AND EXTRACT(YEAR FROM v2.created_at) = EXTRACT(YEAR FROM CURRENT_DATE)
              AND v2.estado = 'completada'
          ) AS costo
        FROM ventas
        WHERE EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM CURRENT_DATE)
          AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE)
          AND estado = 'completada'
      `);
      const [{ gastos_mes }] = await this.dataSource.query(`
        SELECT COALESCE(SUM(monto), 0) AS gastos_mes
        FROM gastos
        WHERE EXTRACT(MONTH FROM fecha) = EXTRACT(MONTH FROM CURRENT_DATE)
          AND EXTRACT(YEAR FROM fecha) = EXTRACT(YEAR FROM CURRENT_DATE)
      `);
      ventasMes.gastos = gastos_mes;
      ventasMes.utilidad = ventasMes.ingresos - ventasMes.costo - gastos_mes;

      const [{ bajo_stock }] = await this.dataSource.query('SELECT COUNT(*) AS bajo_stock FROM vista_productos_bajo_stock');
      const [{ total_clientes }] = await this.dataSource.query(
        `SELECT COUNT(*) AS total_clientes FROM clientes WHERE activo = true AND id != 1`,
      );
      const ultimas_ventas = await this.dataSource.query(`
        SELECT v.folio, v.total, v.metodo_pago, v.created_at, c.nombre AS cliente
        FROM ventas v
        LEFT JOIN clientes c ON v.cliente_id = c.id
        WHERE v.estado = 'completada'
        ORDER BY v.created_at DESC
        LIMIT 5
      `);
      const top_productos = await this.dataSource.query('SELECT * FROM vista_top_productos LIMIT 5');
      const ventas_semana = await this.dataSource.query('SELECT * FROM vista_ventas_diarias LIMIT 7');

      return res.json({
        ok: true,
        dashboard: {
          ventas_hoy: ventasHoy,
          ventas_mes: ventasMes,
          bajo_stock,
          total_clientes,
          ultimas_ventas,
          top_productos,
          ventas_semana,
        },
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ ok: false, mensaje: 'Error al obtener dashboard.' });
    }
  }

  async ventas(req: any, res: any) {
    const { fecha_inicio, fecha_fin } = req.query;
    const { where, params } = this.filtrosVentas(fecha_inicio, fecha_fin);

    try {
      const por_dia = await this.dataSource.query(
        `SELECT
          v.created_at::date AS fecha,
          COUNT(DISTINCT v.id) AS ventas,
          SUM(v.total) AS total,
          SUM(v.iva) AS iva,
          SUM(v.subtotal) AS subtotal,
          COALESCE(SUM(costos.articulos), 0) AS articulos,
          COALESCE(SUM(costos.monto_costo), 0) AS costo
        FROM ventas v
        LEFT JOIN (
          SELECT
            dv.venta_id,
            SUM(dv.cantidad) AS articulos,
            SUM(dv.cantidad * p.precio_compra) AS monto_costo
          FROM detalle_ventas dv
          JOIN productos p ON dv.producto_id = p.id
          GROUP BY dv.venta_id
        ) costos ON v.id = costos.venta_id
        WHERE ${where.join(' AND ')}
        GROUP BY v.created_at::date
        ORDER BY fecha`,
        params,
      );

      const por_metodo = await this.dataSource.query(
        `SELECT metodo_pago, COUNT(*) AS ventas, SUM(total) AS total
        FROM ventas v
        WHERE ${where.join(' AND ')}
        GROUP BY metodo_pago`,
        params,
      );

      // In PostgreSQL $n params can be reused — pass params once
      const innerWhere = where.map((item) => item.replaceAll('v.', 'v2.')).join(' AND ');
      const [totales] = await this.dataSource.query(
        `SELECT
          COUNT(*) AS total_ventas,
          SUM(subtotal) AS subtotal,
          SUM(descuento) AS descuentos,
          SUM(iva) AS iva,
          SUM(total) AS total,
          (
            SELECT COALESCE(SUM(dv.cantidad * p.precio_compra), 0)
            FROM detalle_ventas dv
            JOIN productos p ON dv.producto_id = p.id
            JOIN ventas v2 ON dv.venta_id = v2.id
            WHERE ${innerWhere}
          ) AS costo_total
        FROM ventas v
        WHERE ${where.join(' AND ')}`,
        params,
      );

      const top_productos = await this.dataSource.query(
        `SELECT
          p.nombre,
          COALESCE(c.nombre, 'Sin categoria') AS categoria,
          SUM(dv.cantidad) AS cantidad,
          SUM(dv.subtotal) AS total,
          COALESCE(SUM(dv.cantidad * p.precio_compra), 0) AS costo,
          SUM(dv.subtotal) - COALESCE(SUM(dv.cantidad * p.precio_compra), 0) AS utilidad
        FROM detalle_ventas dv
        JOIN ventas v ON dv.venta_id = v.id
        JOIN productos p ON dv.producto_id = p.id
        LEFT JOIN categorias c ON p.categoria_id = c.id
        WHERE ${where.join(' AND ')}
        GROUP BY p.id, p.nombre, c.nombre
        ORDER BY cantidad DESC
        LIMIT 25`,
        params,
      );

      const detalle_ventas = await this.dataSource.query(
        `SELECT
          v.id,
          v.folio,
          v.created_at,
          COALESCE(c.nombre, 'Publico general') AS cliente,
          COALESCE(u.nombre, 'Sin vendedor') AS vendedor,
          v.metodo_pago,
          SUM(dv.cantidad) AS articulos,
          v.subtotal,
          v.descuento,
          v.iva,
          v.total,
          COALESCE(SUM(dv.cantidad * p.precio_compra), 0) AS costo,
          v.subtotal - COALESCE(SUM(dv.cantidad * p.precio_compra), 0) AS utilidad
        FROM ventas v
        LEFT JOIN clientes c ON v.cliente_id = c.id
        LEFT JOIN usuarios u ON v.usuario_id = u.id
        LEFT JOIN detalle_ventas dv ON v.id = dv.venta_id
        LEFT JOIN productos p ON dv.producto_id = p.id
        WHERE ${where.join(' AND ')}
        GROUP BY v.id, v.folio, v.created_at, c.nombre, u.nombre, v.metodo_pago, v.subtotal, v.descuento, v.iva, v.total
        ORDER BY v.created_at DESC`,
        params,
      );

      const por_categoria = await this.dataSource.query(
        `SELECT
          COALESCE(c.nombre, 'Sin categoria') AS categoria,
          SUM(dv.cantidad) AS cantidad,
          SUM(dv.subtotal) AS total,
          COALESCE(SUM(dv.cantidad * p.precio_compra), 0) AS costo,
          SUM(dv.subtotal) - COALESCE(SUM(dv.cantidad * p.precio_compra), 0) AS utilidad
        FROM detalle_ventas dv
        JOIN ventas v ON dv.venta_id = v.id
        JOIN productos p ON dv.producto_id = p.id
        LEFT JOIN categorias c ON p.categoria_id = c.id
        WHERE ${where.join(' AND ')}
        GROUP BY c.id, c.nombre
        ORDER BY total DESC`,
        params,
      );

      return res.json({ ok: true, por_dia, por_metodo, totales, top_productos, detalle_ventas, por_categoria });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ ok: false, mensaje: 'Error interno.' });
    }
  }

  async usuarios(req: any, res: any) {
    const { fecha_inicio, fecha_fin } = req.query;
    const { where, params } = this.filtrosVentas(fecha_inicio, fecha_fin);

    try {
      const reporte = await this.dataSource.query(
        `SELECT
          u.id,
          u.nombre,
          r.nombre AS rol,
          COUNT(v.id) AS total_ventas,
          COALESCE(SUM(v.total), 0) AS ingresos_totales,
          COALESCE(AVG(v.total), 0) AS ticket_promedio
        FROM usuarios u
        JOIN roles r ON u.rol_id = r.id
        LEFT JOIN ventas v ON u.id = v.usuario_id AND ${where.join(' AND ')}
        WHERE u.deleted_at IS NULL
        GROUP BY u.id, u.nombre, r.nombre
        ORDER BY ingresos_totales DESC`,
        params,
      );

      return res.json({ ok: true, reporte });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ ok: false, mensaje: 'Error al generar reporte de usuarios.' });
    }
  }

  async clientes(req: any, res: any) {
    const { fecha_inicio, fecha_fin } = req.query;
    const { where, params } = this.filtrosVentas(fecha_inicio, fecha_fin);

    try {
      const reporte = await this.dataSource.query(
        `SELECT
          c.id,
          c.nombre,
          c.email,
          c.tipo,
          COUNT(v.id) AS total_compras,
          COALESCE(SUM(v.total), 0) AS total_gastado,
          MAX(v.created_at) AS ultima_compra
        FROM clientes c
        LEFT JOIN ventas v ON c.id = v.cliente_id AND ${where.join(' AND ')}
        WHERE c.deleted_at IS NULL AND c.id != 1
        GROUP BY c.id, c.nombre, c.email, c.tipo
        ORDER BY total_gastado DESC`,
        params,
      );

      return res.json({ ok: true, reporte });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ ok: false, mensaje: 'Error al generar reporte de clientes.' });
    }
  }

  private filtrosVentas(fechaInicio?: string, fechaFin?: string) {
    const where = ["v.estado = 'completada'"];
    const params: string[] = [];
    let paramIdx = 1;

    if (fechaInicio) {
      where.push(`v.created_at::date >= $${paramIdx++}`);
      params.push(fechaInicio);
    }
    if (fechaFin) {
      where.push(`v.created_at::date <= $${paramIdx++}`);
      params.push(fechaFin);
    }

    return { where, params };
  }
}
