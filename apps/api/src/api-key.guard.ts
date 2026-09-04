import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (process.env.API_KEYS_REQUIRED !== 'true') return true;

    const request = context.switchToHttp().getRequest<Request>();
    if (request.path.endsWith('/health')) return true;

    const configuredHash = process.env.API_KEY_HASH;
    const providedKey = request.header('x-api-key');
    if (!configuredHash || !providedKey) throw new UnauthorizedException('API key required.');

    const providedHash = createHash('sha256').update(providedKey).digest('hex');
    const expected = Buffer.from(configuredHash, 'hex');
    const actual = Buffer.from(providedHash, 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new UnauthorizedException('Invalid API key.');
    }

    return true;
  }
}
