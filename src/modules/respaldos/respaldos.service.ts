import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

type BackupTable = {
  name: string;
  rows: Record<string, any>[];
  count: number;
};

type BackupPayload = {
  app: string;
  version: number;
  exportedAt: string;
  database: string;
  exportedBy?: string;
  tables: BackupTable[];
};

type ColumnInfo = {
  name: string;
  dataType: string;
};

@Injectable()
export class RespaldosService {
  constructor(private readonly dataSource: DataSource) {}

  private quoteIdentifier(value: string) {
    if (!/^[A-Za-z0-9_]+$/.test(value)) {
      throw new BadRequestException('El respaldo contiene nombres de tabla o columna invalidos.');
    }
    return `"${value}"`;
  }

  private async getTables(): Promise<string[]> {
    const rows = await this.dataSource.query(
      `SELECT table_name AS name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
    );
    return rows.map((row) => row.name);
  }

  private async getColumns(table: string): Promise<ColumnInfo[]> {
    const rows = await this.dataSource.query(
      `SELECT column_name AS name, data_type AS dataType
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = ?
       ORDER BY ordinal_position`,
      [table],
    );
    return rows.map((row) => ({ name: row.name, dataType: row.dataType }));
  }

  private normalizeColumnValue(value: any, dataType: string) {
    if (value === null || value === undefined) return value;
    if (!['date', 'timestamp', 'timestamp with time zone', 'timestamp without time zone'].includes(dataType)) return value;

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    const pad = (part: number) => String(part).padStart(2, '0');
    const fullDate = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    if (dataType === 'date') return fullDate;
    return `${fullDate} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  async estado(res: any) {
    try {
      const tables = await this.getTables();
      const detalles = await Promise.all(
        tables.map(async (table) => {
          const [row] = await this.dataSource.query(`SELECT COUNT(*) AS count FROM public.${this.quoteIdentifier(table)}`);
          return { table, count: Number(row.count || 0) };
        }),
      );
      const totalRegistros = detalles.reduce((sum, table) => sum + table.count, 0);
      return res.json({ ok: true, totalTablas: detalles.length, totalRegistros, tablas: detalles });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ ok: false, mensaje: 'Error al revisar la base de datos.' });
    }
  }

  async exportar(req: any, res: any) {
    try {
      const tables = await this.getTables();
      const backupTables: BackupTable[] = [];

      for (const table of tables) {
        const rows = await this.dataSource.query(`SELECT * FROM public.${this.quoteIdentifier(table)}`);
        backupTables.push({ name: table, rows, count: rows.length });
      }

      const backup: BackupPayload = {
        app: 'orchid-pos',
        version: 1,
        exportedAt: new Date().toISOString(),
        database: process.env.SUPABASE_PROJECT_REF || process.env.PGDATABASE || 'postgres',
        exportedBy: req.usuario?.email || req.usuario?.nombre,
        tables: backupTables,
      };

      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="respaldo-orchid-pos-${stamp}.json"`);
      return res.send(JSON.stringify(backup, null, 2));
    } catch (error) {
      console.error(error);
      return res.status(500).json({ ok: false, mensaje: 'Error al crear el respaldo.' });
    }
  }

  private validarBackup(body: any): BackupPayload {
    if (!body || body.app !== 'orchid-pos' || !Array.isArray(body.tables)) {
      throw new BadRequestException('El archivo seleccionado no parece ser un respaldo valido de Orchid POS.');
    }

    for (const table of body.tables) {
      if (!table?.name || !Array.isArray(table.rows)) {
        throw new BadRequestException('El respaldo esta incompleto o danado.');
      }
      this.quoteIdentifier(table.name);
      table.rows.forEach((row) => {
        Object.keys(row || {}).forEach((column) => this.quoteIdentifier(column));
      });
    }

    return body as BackupPayload;
  }

  async restaurar(body: any, req: any, res: any) {
    const backup = this.validarBackup(body);
    const existingTables = await this.getTables();
    const existingSet = new Set(existingTables);
    const backupTables = backup.tables.filter((table) => existingSet.has(table.name));
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.query('SET session_replication_role = replica');

      for (const table of existingTables.slice().reverse()) {
        await queryRunner.query(`TRUNCATE TABLE public.${this.quoteIdentifier(table)} RESTART IDENTITY CASCADE`);
      }

      for (const table of backupTables) {
        const columnInfo = await this.getColumns(table.name);
        const availableColumns = new Map(columnInfo.map((column) => [column.name, column.dataType]));
        const rows = table.rows || [];
        if (rows.length === 0) continue;

        for (const row of rows) {
          const columns = Object.keys(row).filter((column) => availableColumns.has(column));
          if (columns.length === 0) continue;
          const placeholders = columns.map(() => '?').join(', ');
          const sql = `INSERT INTO public.${this.quoteIdentifier(table.name)} (${columns.map((column) => this.quoteIdentifier(column)).join(', ')}) VALUES (${placeholders})`;
          await queryRunner.query(sql, columns.map((column) => this.normalizeColumnValue(row[column], availableColumns.get(column))));
        }
      }

      await queryRunner.query('SET session_replication_role = DEFAULT');
      await queryRunner.commitTransaction();

      const totalRegistros = backupTables.reduce((sum, table) => sum + table.rows.length, 0);
      return res.json({
        ok: true,
        mensaje: 'Informacion restaurada correctamente.',
        restauradoPor: req.usuario?.email || req.usuario?.nombre,
        totalTablas: backupTables.length,
        totalRegistros,
      });
    } catch (error) {
      await queryRunner.rollbackTransaction();
      try {
        await queryRunner.query('SET session_replication_role = DEFAULT');
      } catch {}
      console.error(error);
      return res.status(500).json({ ok: false, mensaje: 'Error al restaurar el respaldo. No se aplicaron cambios.' });
    } finally {
      await queryRunner.release();
    }
  }
}
