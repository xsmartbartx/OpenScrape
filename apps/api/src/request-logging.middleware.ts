import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('http');

  use(request: Request, response: Response, next: NextFunction): void {
    const incomingId = request.header('x-request-id');
    const requestId = incomingId && /^[a-zA-Z0-9._:-]{1,128}$/.test(incomingId) ? incomingId : randomUUID();
    const startedAt = process.hrtime.bigint();
    response.setHeader('x-request-id', requestId);

    response.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      this.logger.log(JSON.stringify({
        requestId,
        method: request.method,
        path: request.originalUrl,
        statusCode: response.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
      }));
    });

    next();
  }
}
