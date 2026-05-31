import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('health')
  health() {
    return { ok: true, mensaje: 'Orchid POS API NestJS funcionando', version: '1.0.0' };
  }
}
