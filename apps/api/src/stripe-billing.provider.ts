import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';

@Injectable()
export class StripeBillingProvider {
  private client(): Stripe {
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) throw new Error('Stripe billing is not configured.');
    return new Stripe(secret);
  }

  async createCheckout(input: { workspaceId: string; email: string; priceId: string; plan: string }) {
    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
    return this.client().checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: input.priceId, quantity: 1 }],
      customer_email: input.email,
      client_reference_id: input.workspaceId,
      metadata: { workspaceId: input.workspaceId, plan: input.plan },
      subscription_data: { metadata: { workspaceId: input.workspaceId, plan: input.plan } },
      success_url: `${appUrl}/?billing=success`,
      cancel_url: `${appUrl}/?billing=cancelled`,
    });
  }

  async listInvoices(customerId: string) {
    return this.client().invoices.list({ customer: customerId, limit: 20 });
  }

  constructEvent(rawBody: string, signature: string): Stripe.Event {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new Error('Stripe webhook is not configured.');
    return this.client().webhooks.constructEvent(rawBody, signature, secret);
  }
}