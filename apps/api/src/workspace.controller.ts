import { Body, Controller, Delete, Post, Req, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import type { SessionUser } from './session.guard';
import { PrismaService } from './prisma.service';
import { AuditService } from './audit.service';

type RequestWithUser = Request & { user?: SessionUser };
type DeleteWorkspaceInput = { confirmation?: string };
type RetentionInput = { olderThanDays?: number };

@Controller('workspace')
export class WorkspaceController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Delete()
  async deleteWorkspace(@Body() body: DeleteWorkspaceInput, @Req() request: RequestWithUser) {
    const user = request.user;
    if (!user) throw new UnauthorizedException('Authenticated session required.');
    if (body.confirmation !== user.workspaceId) throw new ForbiddenException('Workspace confirmation does not match.');

    const membership = await this.prisma.membership.findUnique({
      where: { userId_workspaceId: { userId: user.id, workspaceId: user.workspaceId } },
    });
    if (membership?.role !== 'owner') throw new ForbiddenException('Only the workspace owner can delete this workspace.');

    await this.audit.record({ action: 'workspace.delete', userId: user.id, workspaceId: user.workspaceId });
    await this.prisma.workspace.delete({ where: { id: user.workspaceId } });
    return { deleted: true };
  }

  @Post('retention/artifacts')
  async deleteOldArtifacts(@Body() body: RetentionInput, @Req() request: RequestWithUser) {
    const user = await this.requireOwner(request);
    const olderThanDays = Number(body.olderThanDays ?? 30);
    if (!Number.isInteger(olderThanDays) || olderThanDays < 1 || olderThanDays > 3650) {
      throw new ForbiddenException('olderThanDays must be an integer between 1 and 3650.');
    }

    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    const result = await this.prisma.run.updateMany({
      where: {
        robot: { workspaceId: user.workspaceId },
        finishedAt: { lt: cutoff },
        OR: [{ html: { not: null } }, { screenshot: { not: null } }],
      },
      data: { html: null, screenshot: null },
    });
    await this.audit.record({
      action: 'workspace.retention.artifacts',
      userId: user.id,
      workspaceId: user.workspaceId,
      metadata: { olderThanDays, deletedArtifacts: result.count },
    });

    return { deletedRuns: result.count, olderThanDays };
  }

  private async requireOwner(request: RequestWithUser): Promise<SessionUser> {
    if (!request.user) throw new UnauthorizedException('Authenticated session required.');
    const membership = await this.prisma.membership.findUnique({
      where: { userId_workspaceId: { userId: request.user.id, workspaceId: request.user.workspaceId } },
    });
    if (membership?.role !== 'owner') throw new ForbiddenException('Only the workspace owner can manage retention.');
    return request.user;
  }
}
