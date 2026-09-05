import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { PrismaService } from './prisma.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env.API_KEYS_REQUIRED !== 'true') return true;

    const request = context.switchToHttp().getRequest<Request>();
    if (request.path.endsWith('/health') || request.path.includes('/auth/')) return true;

    const providedKey = request.header('x-api-key');
    if (!providedKey) throw new UnauthorizedException('API key required.');

    const providedHash = createHash('sha256').update(providedKey).digest('hex');
    const storedKey = await this.prisma.apiKey.findFirst({
      where: { hash: providedHash, revokedAt: null },
    });
    const configuredHash = process.env.API_KEY_HASH;
    const expected = Buffer.from(storedKey?.hash ?? configuredHash ?? '', 'hex');
    const actual = Buffer.from(providedHash, 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new UnauthorizedException('Invalid API key.');
    }

    if (storedKey) {
      await this.prisma.apiKey.update({ where: { id: storedKey.id }, data: { lastUsedAt: new Date() } });
    }

    return true;
  }
}
