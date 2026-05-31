import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { IS_PUBLIC_KEY } from './decorators';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers?.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      throw new HttpException(
        { ok: false, mensaje: 'Acceso denegado. Se requiere token de autenticacion.' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    try {
      request.usuario = jwt.verify(token, process.env.JWT_SECRET as string);
      return true;
    } catch {
      throw new HttpException({ ok: false, mensaje: 'Token invalido o expirado.' }, HttpStatus.FORBIDDEN);
    }
  }
}
