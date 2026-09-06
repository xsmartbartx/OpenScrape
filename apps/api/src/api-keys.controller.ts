import { Body, Controller, Delete, Get, Param, Post, Req, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { Request } from 'express';
import type { SessionUser } from './session.guard';
import { PrismaService } from './prisma.service';
import { AuditService } from './audit.service';

type RequestWithUser = Request & { user?: SessionUser };

type CreateApiKeyInput = { name?: string };

@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Get()
  async list(@Req() request: RequestWithUser) {
    const user = this.requireUser(request);
    return this.prisma.apiKey.findMany({
      where: { userId: user.id, workspaceId: user.workspaceId },
      select: { id: true, name: true, createdAt: true, lastUsedAt: true, revokedAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post()
  async create(@Body() body: CreateApiKeyInput, @Req() request: RequestWithUser) {
    const user = this.requireUser(request);
    const secret = `os_${randomBytes(32).toString('base64url')}`;
    const key = await this.prisma.apiKey.create({
      data: {
        id: `key-${randomBytes(12).toString('hex')}`,
        name: body.name?.trim() || 'API key',
        hash: this.hash(secret),
        userId: user.id,
        workspaceId: user.workspaceId,
      },
      select: { id: true, name: true, createdAt: true },
    });
    await this.audit.record({ action: 'api_key.create', userId: user.id, workspaceId: user.workspaceId, resourceType: 'ApiKey', resourceId: key.id });

    return { ...key, secret };
  }

  @Delete(':id')
  async revoke(@Param('id') id: string, @Req() request: RequestWithUser) {
    const user = this.requireUser(request);
    const result = await this.prisma.apiKey.updateMany({
      where: { id, userId: user.id, workspaceId: user.workspaceId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 1) await this.audit.record({ action: 'api_key.revoke', userId: user.id, workspaceId: user.workspaceId, resourceType: 'ApiKey', resourceId: id });

    return { revoked: result.count === 1 };
  }

  private requireUser(request: RequestWithUser): SessionUser {
    if (!request.user) throw new UnauthorizedException('Authenticated session required.');
    return request.user;
  }

  private hash(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }
}
