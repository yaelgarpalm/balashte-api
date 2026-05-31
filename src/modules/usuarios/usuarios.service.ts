import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
const { parsePermisos } = require('../../utils/helpers');

@Injectable()
export class UsuariosService {
  constructor(private readonly dataSource: DataSource) {}
  async findAll(req: any, res: any) {
    try {
      const usuarios = await this.dataSource.query(`SELECT u.id, u.nombre, u.email, u.activo, u.ultimo_login, u.created_at, r.nombre AS rol FROM usuarios u JOIN roles r ON u.rol_id = r.id WHERE u.deleted_at IS NULL ORDER BY u.nombre`);
      return res.json({ ok: true, usuarios });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error interno.' });
    }
  }
  async create(req: any, res: any) {
    const { nombre, email, password, rol_id } = req.body;
    if (!nombre || !email || !password || !rol_id) return res.status(400).json({ ok: false, mensaje: 'Todos los campos son obligatorios.' });
    if (password.length < 6) return res.status(400).json({ ok: false, mensaje: 'La contraseña debe tener al menos 6 caracteres.' });
    try {
      const hash = await bcrypt.hash(password, 10);
      const result = await this.dataSource.query('INSERT INTO usuarios (nombre, email, password, rol_id) VALUES (?, ?, ?, ?)', [nombre, email, hash, rol_id]);
      await this.aplicarBeneficiosAutomaticos(result.insertId, 'empleado');
      return res.status(201).json({ ok: true, mensaje: 'Usuario creado.', id: result.insertId });
    } catch (error: any) {
      if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ ok: false, mensaje: 'El email ya está registrado.' });
      return res.status(500).json({ ok: false, mensaje: 'Error interno.' });
    }
  }
  async update(req: any, res: any) {
    const { nombre, email, rol_id, activo, password } = req.body;
    try {
      if (password && password.length >= 6) {
        const hash = await bcrypt.hash(password, 10);
        await this.dataSource.query('UPDATE usuarios SET nombre=?, email=?, rol_id=?, activo=?, password=? WHERE id=?', [nombre, email, rol_id, activo !== undefined ? activo : true, hash, req.params.id]);
      } else {
        await this.dataSource.query('UPDATE usuarios SET nombre=?, email=?, rol_id=?, activo=? WHERE id=?', [nombre, email, rol_id, activo !== undefined ? activo : true, req.params.id]);
      }
      return res.json({ ok: true, mensaje: 'Usuario actualizado.' });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error interno.' });
    }
  }
  async remove(req: any, res: any) {
    try {
      await this.dataSource.query('UPDATE usuarios SET activo=FALSE, deleted_at=NOW() WHERE id=?', [req.params.id]);
      return res.json({ ok: true, mensaje: 'Usuario eliminado.' });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error interno.' });
    }
  }
  async roles(req: any, res: any) {
    try {
      const rows = await this.dataSource.query('SELECT * FROM roles');
      const roles = rows.map((r) => ({ ...r, permisos: parsePermisos(r.permisos) }));
      return res.json({ ok: true, roles });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error interno.' });
    }
  }
  private async aplicarBeneficiosAutomaticos(entidadId: number, entidadType: string) {
    const beneficios = await this.dataSource.query('SELECT id FROM beneficios WHERE target_type = ? AND is_automatic = TRUE AND activo = TRUE AND deleted_at IS NULL', [entidadType]);
    for (const b of beneficios) await this.dataSource.query('INSERT IGNORE INTO beneficios_asignados (beneficio_id, entidad_id, entidad_type) VALUES (?, ?, ?)', [b.id, entidadId, entidadType]);
  }
}
