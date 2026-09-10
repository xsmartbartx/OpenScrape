import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, Optional, Post, Req, UnauthorizedException } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import type Stripe from 'stripe';
import { PrismaService } from './prisma.service';
import type { SessionUser } from './session.guard';
import { StripeBillingProvider } from './stripe-billing.provider';

type BillingPayload = {
  id?: string;
  type?: string;
  workspaceId?: string;
  customerId?: string;
  subscriptionId?: string;
  plan?: string;
  status?: string;
  currentPeriodEnd?: string;
};

type RawRequest = Request & { rawBody?: Buffer };
type RequestWithUser = RawRequest & { user?: SessionUser };
type CheckoutInput = { priceId?: string; plan?: string };

@Controller('billing')
export class BillingController {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly stripe?: StripeBillingProvider) {}

  @Post('checkout')
  async checkout(@Body() body: CheckoutInput, @Req() request: RequestWithUser) {
    const user = await this.requireOwner(request);
    const priceId = body.priceId ?? process.env.STRIPE_PRICE_ID;
    if (!priceId) throw new BadRequestException('Stripe price is not configured.');
    if (!this.stripe) throw new BadRequestException('Stripe billing is not available.');
    const session = await this.stripe.createCheckout({
      workspaceId: user.workspaceId,
      email: user.email,
      priceId,
      plan: body.plan ?? process.env.STRIPE_PLAN ?? 'pro',
    });
    return { id: session.id, url: session.url };
  }

  @Get('subscription')
  async subscription(@Req() request: RequestWithUser) {
    const user = this.requireUser(request);
    return this.prisma.subscription.findUnique({ where: { workspaceId: user.workspaceId } });
  }

  @Get('invoices')
  async invoices(@Req() request: RequestWithUser) {
    const user = this.requireUser(request);
    const subscription = await this.prisma.subscription.findUnique({ where: { workspaceId: user.workspaceId } });
    if (!subscription?.providerCustomerId || subscription.provider !== 'stripe' || !this.stripe) return { invoices: [] };
    const result = await this.stripe.listInvoices(subscription.providerCustomerId);
    return {
      invoices: result.data.map((invoice) => ({
        id: invoice.id,
        status: invoice.status,
        currency: invoice.currency,
        amountDue: invoice.amount_due,
        hostedInvoiceUrl: invoice.hosted_invoice_url,
        createdAt: new Date(invoice.created * 1000).toISOString(),
      })),
    };
  }

  @Post('stripe/webhook')
  async stripeWebhook(@Req() request: RawRequest, @Headers('stripe-signature') signature: string | undefined) {
    const rawBody = request.rawBody?.toString('utf8');
    if (!rawBody || !signature || !this.stripe) throw new UnauthorizedException('Invalid Stripe webhook.');

    let event: Stripe.Event;
    try {
      event = this.stripe.constructEvent(rawBody, signature);
    } catch {
      throw new UnauthorizedException('Invalid Stripe webhook signature.');
    }
    const existing = await this.prisma.billingEvent.findUnique({ where: { provider_eventId: { provider: 'stripe', eventId: event.id } } });
    if (existing) return { accepted: true, duplicate: true };

    await this.prisma.billingEvent.create({
      data: {
        id: `billing-event-${event.id}`,
        provider: 'stripe',
        eventId: event.id,
        eventType: event.type,
        payloadHash: createHash('sha256').update(rawBody).digest('hex'),
      },
    });
    await this.applyStripeEvent(event);
    await this.prisma.billingEvent.update({ where: { id: `billing-event-${event.id}` }, data: { processedAt: new Date() } });
    return { accepted: true, duplicate: false };
  }

  @Post('webhook/:provider')
  async webhook(@Req() request: RawRequest, @Headers('x-billing-signature') signature: string | undefined, @Headers('x-billing-event-id') eventId: string | undefined, @Headers('x-billing-event-type') eventType: string | undefined, @Headers('x-billing-timestamp') timestamp: string | undefined) {
    const provider = String(request.params.provider);
    const rawBody = request.rawBody?.toString('utf8');
    const secret = process.env.BILLING_WEBHOOK_SECRET;
    if (!secret || !signature || !eventId || !eventType || !timestamp || !rawBody) throw new UnauthorizedException('Invalid billing webhook.');
    if (Math.abs(Date.now() - Number(timestamp)) > 5 * 60 * 1000) throw new UnauthorizedException('Expired billing webhook.');

    const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
    const provided = Buffer.from(signature, 'hex');
    const actual = Buffer.from(expected, 'hex');
    if (provided.length !== actual.length || !timingSafeEqual(provided, actual)) throw new UnauthorizedException('Invalid billing signature.');

    const existing = await this.prisma.billingEvent.findUnique({ where: { provider_eventId: { provider, eventId } } });
    if (existing) return { accepted: true, duplicate: true };

    let payload: BillingPayload;
    try {
      payload = JSON.parse(rawBody) as BillingPayload;
    } catch {
      throw new BadRequestException('Billing payload must be valid JSON.');
    }
    if (!payload.workspaceId || !payload.id) throw new BadRequestException('Billing payload is missing required fields.');

    await this.prisma.billingEvent.create({
      data: {
        id: `billing-event-${eventId}`,
        provider,
        eventId,
        eventType,
        payloadHash: createHash('sha256').update(rawBody).digest('hex'),
        processedAt: new Date(),
      },
    });
    await this.prisma.subscription.upsert({
      where: { workspaceId: payload.workspaceId },
      create: {
        id: `subscription-${payload.subscriptionId ?? payload.id}`,
        workspaceId: payload.workspaceId,
        provider,
        providerCustomerId: payload.customerId,
        providerSubscriptionId: payload.subscriptionId,
        plan: payload.plan ?? 'free',
        status: payload.status ?? 'active',
        currentPeriodEnd: payload.currentPeriodEnd ? new Date(payload.currentPeriodEnd) : undefined,
      },
      update: {
        providerCustomerId: payload.customerId,
        providerSubscriptionId: payload.subscriptionId,
        plan: payload.plan ?? 'free',
        status: payload.status ?? 'active',
        currentPeriodEnd: payload.currentPeriodEnd ? new Date(payload.currentPeriodEnd) : undefined,
      },
    });
    await this.prisma.workspace.update({
      where: { id: payload.workspaceId },
      data: { plan: payload.plan ?? 'free' },
    });

    return { accepted: true, duplicate: false };
  }

  private async applyStripeEvent(event: Stripe.Event): Promise<void> {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const workspaceId = session.metadata?.workspaceId ?? session.client_reference_id;
      if (!workspaceId) return;
      const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
      await this.syncSubscription({
        workspaceId,
        customerId: typeof session.customer === 'string' ? session.customer : undefined,
        subscriptionId,
        plan: session.metadata?.plan ?? 'pro',
        status: 'active',
      });
      return;
    }

    if (event.type.startsWith('customer.subscription.')) {
      const subscription = event.data.object as Stripe.Subscription;
      const existing = await this.prisma.subscription.findUnique({ where: { providerSubscriptionId: subscription.id } });
      const workspaceId = subscription.metadata?.workspaceId ?? existing?.workspaceId;
      if (!workspaceId) return;
      await this.syncSubscription({
        workspaceId,
        customerId: typeof subscription.customer === 'string' ? subscription.customer : undefined,
        subscriptionId: subscription.id,
        plan: subscription.metadata?.plan ?? existing?.plan ?? 'pro',
        status: subscription.status,
        currentPeriodEnd: subscription.items.data[0]?.current_period_end,
      });
    }
  }

  private async syncSubscription(input: { workspaceId: string; customerId?: string; subscriptionId?: string; plan: string; status: string; currentPeriodEnd?: number }) {
    await this.prisma.subscription.upsert({
      where: { workspaceId: input.workspaceId },
      create: {
        id: `subscription-${input.subscriptionId ?? Date.now()}`,
        workspaceId: input.workspaceId,
        provider: 'stripe',
        providerCustomerId: input.customerId,
        providerSubscriptionId: input.subscriptionId,
        plan: input.plan,
        status: input.status,
        currentPeriodEnd: input.currentPeriodEnd ? new Date(input.currentPeriodEnd * 1000) : undefined,
      },
      update: {
        providerCustomerId: input.customerId,
        providerSubscriptionId: input.subscriptionId,
        plan: input.plan,
        status: input.status,
        currentPeriodEnd: input.currentPeriodEnd ? new Date(input.currentPeriodEnd * 1000) : undefined,
      },
    });
    await this.prisma.workspace.update({ where: { id: input.workspaceId }, data: { plan: input.plan } });
  }

  private requireUser(request: RequestWithUser): SessionUser {
    if (!request.user) throw new UnauthorizedException('Authenticated session required.');
    return request.user;
  }

  private async requireOwner(request: RequestWithUser): Promise<SessionUser> {
    const user = this.requireUser(request);
    const membership = await this.prisma.membership.findUnique({ where: { userId_workspaceId: { userId: user.id, workspaceId: user.workspaceId } } });
    if (membership?.role !== 'owner') throw new ForbiddenException('Only the workspace owner can manage billing.');
    return user;
  }
}
