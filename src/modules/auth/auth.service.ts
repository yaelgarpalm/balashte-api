import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
const { parsePermisos } = require('../../utils/helpers');

@Injectable()
export class AuthService {
  constructor(private readonly dataSource: DataSource) {}

  async login(req: any, res: any) {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ ok: false, mensaje: 'Email y contraseña son requeridos.' });

    try {
      const rows = await this.dataSource.query(
        `SELECT u.*, r.nombre AS rol, r.permisos
         FROM usuarios u
         JOIN roles r ON u.rol_id = r.id
         WHERE u.email = ? AND u.activo = TRUE`,
        [email],
      );
      if (!rows.length) return res.status(401).json({ ok: false, mensaje: 'Credenciales inválidas.' });

      const usuario = rows[0];
      const passwordValido = await bcrypt.compare(password, usuario.password);
      if (!passwordValido) return res.status(401).json({ ok: false, mensaje: 'Credenciales inválidas.' });

      await this.dataSource.query('UPDATE usuarios SET ultimo_login = NOW() WHERE id = ?', [usuario.id]);
      const permisos = parsePermisos(usuario.permisos);
      const token = jwt.sign(
        { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, rol_id: usuario.rol_id, permisos },
        process.env.JWT_SECRET as string,
        { expiresIn: process.env.JWT_EXPIRES_IN || '8h' },
      );

      return res.json({ ok: true, token, usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, permisos } });
    } catch (error) {
      console.error('Error en login:', error);
      return res.status(500).json({ ok: false, mensaje: 'Error interno del servidor.' });
    }
  }

  async perfil(req: any, res: any) {
    try {
      const rows = await this.dataSource.query(
        `SELECT u.id, u.nombre, u.email, r.nombre AS rol, r.permisos, u.ultimo_login, u.created_at
         FROM usuarios u JOIN roles r ON u.rol_id = r.id
         WHERE u.id = ?`,
        [req.usuario.id],
      );
      if (rows.length) rows[0].permisos = parsePermisos(rows[0].permisos);
      return res.json({ ok: true, usuario: rows[0] });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error interno.' });
    }
  }

  async cambiarPassword(req: any, res: any) {
    const { password_actual, password_nuevo } = req.body;
    if (!password_actual || !password_nuevo) return res.status(400).json({ ok: false, mensaje: 'Se requieren ambas contraseñas.' });
    if (password_nuevo.length < 6) return res.status(400).json({ ok: false, mensaje: 'La nueva contraseña debe tener al menos 6 caracteres.' });

    try {
      const rows = await this.dataSource.query('SELECT password FROM usuarios WHERE id = ?', [req.usuario.id]);
      const valido = await bcrypt.compare(password_actual, rows[0].password);
      if (!valido) return res.status(401).json({ ok: false, mensaje: 'La contraseña actual es incorrecta.' });

      const hash = await bcrypt.hash(password_nuevo, 10);
      await this.dataSource.query('UPDATE usuarios SET password = ? WHERE id = ?', [hash, req.usuario.id]);
      return res.json({ ok: true, mensaje: 'Contraseña actualizada correctamente.' });
    } catch {
      return res.status(500).json({ ok: false, mensaje: 'Error interno.' });
    }
  }
}
