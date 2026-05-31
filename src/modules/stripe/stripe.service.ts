import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private readonly stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

  async createCheckoutSession(req: any, res: any) {
    try {
      const { amount, currency = 'mxn', success_url, cancel_url, metadata } = req.body;
      if (!amount || amount <= 0) return res.status(400).json({ mensaje: 'Monto inválido' });
      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: { currency, product_data: { name: 'Pago POS Balashte' }, unit_amount: Math.round(amount * 100) },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: success_url || `${req.headers.origin}/pos?stripe_success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancel_url || `${req.headers.origin}/pos?stripe_cancel=true`,
        metadata: metadata || {},
      });
      return res.json({ url: session.url, sessionId: session.id });
    } catch (error: any) {
      console.error('[Stripe] Error creating checkout session:', error);
      return res.status(500).json({ mensaje: 'Error al procesar el pago con Stripe', error: error.message });
    }
  }
}
