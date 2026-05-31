import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth.guard';
import { RolesGuard } from '../../roles.guard';
import { StripeService } from './stripe.service';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';

@Controller('api/stripe')
@UseGuards(AuthGuard, RolesGuard)
export class StripeController {
  constructor(private readonly stripeService: StripeService) {}
  @Post('create-checkout-session')
  createCheckoutSession(@Body() _dto: CreateCheckoutSessionDto, @Req() req: any, @Res() res: any) {
    return this.stripeService.createCheckoutSession(req, res);
  }
}
