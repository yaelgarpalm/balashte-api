import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class ConfiguracionService {
  constructor(private readonly dataSource: DataSource) {}
  async get(req: any, res: any) {
    try {
      const rows = await this.dataSource.query('SELECT clave, valor FROM configuracion');
      const config = {};
      rows.forEach((row) => { config[row.clave] = row.valor; });
      return res.json({ ok: true, config });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ ok: false, mensaje: 'Error al obtener la configuración.' });
    }
  }
  async update(req: any, res: any) {
    try {
      for (const [clave, valor] of Object.entries(req.body)) {
        await this.dataSource.query(
          'INSERT INTO configuracion (clave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = ?',
          [clave, valor, valor],
        );
      }
      return res.json({ ok: true, mensaje: 'Configuración actualizada correctamente.' });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ ok: false, mensaje: 'Error al actualizar la configuración.' });
    }
  }
}
