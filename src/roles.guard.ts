import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './decorators';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;

    const request = context.switchToHttp().getRequest();
    if (!request.usuario) {
      throw new HttpException({ ok: false, mensaje: 'No autenticado.' }, HttpStatus.UNAUTHORIZED);
    }
    if (!roles.includes(request.usuario.rol)) {
      throw new HttpException(
        { ok: false, mensaje: `Acceso denegado. Se requiere rol: ${roles.join(' o ')}` },
        HttpStatus.FORBIDDEN,
      );
    }
    return true;
  }
}
