import { Body, Controller, Get, Post, Put, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth.guard';
import { Public } from '../../decorators';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { CambiarPasswordDto } from './dto/cambiar-password.dto';

@Controller('api/auth')
@UseGuards(AuthGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() _dto: LoginDto, @Req() req: any, @Res() res: any) {
    return this.authService.login(req, res);
  }

  @Get('perfil')
  perfil(@Req() req: any, @Res() res: any) {
    return this.authService.perfil(req, res);
  }

  @Put('cambiar-password')
  cambiarPassword(@Body() _dto: CambiarPasswordDto, @Req() req: any, @Res() res: any) {
    return this.authService.cambiarPassword(req, res);
  }
}
