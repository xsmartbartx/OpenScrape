import { BadRequestException, Controller, Headers, Post, Req, UnauthorizedException } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { PrismaService } from './prisma.service';

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

@Controller('billing')
export class BillingController {
  constructor(private readonly prisma: PrismaService) {}

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

    return { accepted: true, duplicate: false };
  }
}
