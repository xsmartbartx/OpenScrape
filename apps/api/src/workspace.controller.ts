import { Body, Controller, Delete, Req, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import type { SessionUser } from './session.guard';
import { PrismaService } from './prisma.service';
import { AuditService } from './audit.service';

type RequestWithUser = Request & { user?: SessionUser };
type DeleteWorkspaceInput = { confirmation?: string };

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
}
