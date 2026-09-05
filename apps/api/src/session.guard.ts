import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { PrismaService } from './prisma.service';

export type SessionUser = { id: string; email: string; displayName: string; workspaceId: string };

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.path.endsWith('/health') || request.path.includes('/auth/')) return true;
    if (process.env.AUTH_REQUIRED !== 'true') return true;

    const authorization = request.header('authorization');
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('Session token required.');

    const session = await this.prisma.session.findFirst({
      where: { tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: { gt: new Date() } },
      include: { user: { include: { memberships: { orderBy: { createdAt: 'asc' } } } } },
    });
    const membership = session?.user.memberships[0];
    if (!session || !membership) throw new UnauthorizedException('Invalid or expired session.');

    (request as Request & { user?: SessionUser }).user = {
      id: session.user.id,
      email: session.user.email,
      displayName: session.user.displayName,
      workspaceId: membership.workspaceId,
    };
    return true;
  }
}
