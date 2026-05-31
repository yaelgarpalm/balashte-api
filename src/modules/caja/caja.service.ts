import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class CajaService {
  constructor(private readonly dataSource: DataSource) {}

  private async getTotalesCaja(cajaId: number) {
    const totales = await this.dataSource.query(
      `SELECT
        COALESCE(SUM(CASE WHEN metodo_pago = 'efectivo' AND estado != 'cancelada' THEN total ELSE 0 END), 0) as ventas_efectivo,
        COALESCE(SUM(CASE WHEN metodo_pago = 'tarjeta' AND estado != 'cancelada' THEN total ELSE 0 END), 0) as ventas_tarjeta,
        COALESCE(SUM(CASE WHEN metodo_pago = 'transferencia' AND estado != 'cancelada' THEN total ELSE 0 END), 0) as ventas_transferencia
       FROM ventas WHERE caja_id = ?`,
      [cajaId],
    );
    const movs = await this.dataSource.query(
      `SELECT
        COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN monto ELSE 0 END), 0) as entradas,
        COALESCE(SUM(CASE WHEN tipo = 'salida' THEN monto ELSE 0 END), 0) as salidas
       FROM movimientos_caja WHERE caja_id = ?`,
      [cajaId],
    );
    return { totales: totales[0], movs: movs[0] };
  }

  async estado(req: any, res: any) {
    try {
      const cajas = await this.dataSource.query("SELECT * FROM cajas WHERE estado = 'abierta' LIMIT 1");
      const caja = cajas[0];
      if (!caja) return res.json({ ok: true, abierta: false });
      const { totales, movs } = await this.getTotalesCaja(caja.id);
      const montoEsperado = Number(caja.monto_apertura) + Number(totales.ventas_efectivo) + Number(movs.entradas) - Number(movs.salidas);
      return res.json({ ok: true, abierta: true, caja: { ...caja, ...totales, ...movs, monto_esperado: montoEsperado } });
    } catch (error) {
      console.error('Error al obtener estado de caja:', error);
      return res.status(500).json({ ok: false, mensaje: 'Error al obtener estado de la caja' });
    }
  }

  async abrir(req: any, res: any) {
    const { monto_apertura, notas } = req.body;
    try {
      const existe = await this.dataSource.query("SELECT id FROM cajas WHERE estado = 'abierta'");
      if (existe[0]) return res.status(400).json({ ok: false, mensaje: 'Ya existe una caja abierta.' });
      const result = await this.dataSource.query(
        `INSERT INTO cajas (usuario_id, monto_apertura, monto_esperado, notas, estado, fecha_apertura)
         VALUES (?, ?, ?, ?, 'abierta', NOW())`,
        [req.usuario.id, monto_apertura || 0, monto_apertura || 0, notas || null],
      );
      return res.status(201).json({ ok: true, mensaje: 'Caja abierta con éxito', cajaId: result.insertId });
    } catch (error) {
      console.error('Error al abrir caja:', error);
      return res.status(500).json({ ok: false, mensaje: 'Error al abrir la caja' });
    }
  }

  async cerrar(req: any, res: any) {
    const { monto_real, notas } = req.body;
    try {
      const cajas = await this.dataSource.query("SELECT * FROM cajas WHERE estado = 'abierta' LIMIT 1");
      const caja = cajas[0];
      if (!caja) return res.status(400).json({ ok: false, mensaje: 'No hay ninguna caja abierta.' });
      const { totales, movs } = await this.getTotalesCaja(caja.id);
      const montoEsperado = Number(caja.monto_apertura) + Number(totales.ventas_efectivo) + Number(movs.entradas) - Number(movs.salidas);
      const diferencia = Number(monto_real) - montoEsperado;
      await this.dataSource.query(
        `UPDATE cajas SET monto_cierre=?, monto_ventas_efectivo=?, monto_ventas_tarjeta=?, monto_ventas_transferencia=?,
         monto_entradas=?, monto_salidas=?, monto_esperado=?, monto_real=?, diferencia=?, estado='cerrada', fecha_cierre=NOW(), notas=COALESCE(?, notas)
         WHERE id = ?`,
        [monto_real, totales.ventas_efectivo, totales.ventas_tarjeta, totales.ventas_transferencia, movs.entradas, movs.salidas, montoEsperado, monto_real, diferencia, notas || null, caja.id],
      );
      return res.json({
        ok: true,
        mensaje: 'Caja cerrada correctamente',
        alerta_admin: Math.abs(diferencia) >= 0.1,
        totales: { esperado: montoEsperado, real: monto_real, diferencia },
      });
    } catch (error) {
      console.error('Error al cerrar caja:', error);
      return res.status(500).json({ ok: false, mensaje: 'Error al cerrar la caja' });
    }
  }

  async movimiento(req: any, res: any) {
    const { tipo, monto, concepto } = req.body;
    if (!['entrada', 'salida'].includes(tipo)) return res.status(400).json({ ok: false, mensaje: 'Tipo de movimiento inválido.' });
    try {
      const cajas = await this.dataSource.query("SELECT id FROM cajas WHERE estado = 'abierta' LIMIT 1");
      const caja = cajas[0];
      if (!caja) return res.status(400).json({ ok: false, mensaje: 'No hay una caja abierta para registrar movimientos.' });
      await this.dataSource.query('INSERT INTO movimientos_caja (caja_id, usuario_id, tipo, monto, concepto) VALUES (?, ?, ?, ?, ?)', [caja.id, req.usuario.id, tipo, monto, concepto]);
      return res.status(201).json({ ok: true, mensaje: 'Movimiento registrado con éxito' });
    } catch (error) {
      console.error('Error al registrar movimiento:', error);
      return res.status(500).json({ ok: false, mensaje: 'Error al registrar el movimiento' });
    }
  }

  async historial(req: any, res: any) {
    try {
      const cajas = await this.dataSource.query(
        `SELECT c.*, u.nombre as usuario_nombre
         FROM cajas c JOIN usuarios u ON c.usuario_id = u.id
         ORDER BY c.fecha_apertura DESC LIMIT 50`,
      );
      return res.json({ ok: true, cajas });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error al obtener historial' });
    }
  }

  async alertas(req: any, res: any) {
    try {
      const alertas = await this.dataSource.query(
        `SELECT c.id, c.fecha_apertura, c.fecha_cierre, c.monto_esperado, c.monto_real, c.diferencia,
                c.notas, u.nombre AS usuario_nombre, u.email AS usuario_email
         FROM cajas c
         JOIN usuarios u ON c.usuario_id = u.id
         WHERE c.estado = 'cerrada'
           AND c.diferencia IS NOT NULL
           AND ABS(c.diferencia) >= 0.1
           AND c.fecha_cierre >= DATE_SUB(NOW(), INTERVAL 7 DAY)
         ORDER BY c.fecha_cierre DESC
         LIMIT 20`,
      );
      return res.json({ ok: true, alertas });
    } catch (error) {
      console.error('Error al obtener alertas de caja:', error);
      return res.status(500).json({ ok: false, mensaje: 'Error al obtener alertas de caja' });
    }
  }
}
