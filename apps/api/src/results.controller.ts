import { Controller, Get, Header, Param, Query, Req, UnauthorizedException, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import type { SessionUser } from './session.guard';
import { PrismaService } from './prisma.service';

type RequestWithUser = Request & { user?: SessionUser };

@Controller('robots')
export class ResultsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':robotId/runs/:runId/results')
  async list(@Param('robotId') robotId: string, @Param('runId') runId: string, @Query('page') pageValue: string | undefined, @Query('pageSize') pageSizeValue: string | undefined, @Req() request: RequestWithUser) {
    const user = this.requireUser(request);
    const page = Math.max(Number(pageValue ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(pageSizeValue ?? 50), 1), 500);
    const run = await this.prisma.run.findFirst({ where: { id: runId, robotId, robot: { workspaceId: user.workspaceId } }, select: { id: true } });
    if (!run) throw new NotFoundException('Run not found.');

    const [items, total] = await Promise.all([
      this.prisma.result.findMany({ where: { runId }, orderBy: { createdAt: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.result.count({ where: { runId } }),
    ]);
    return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
  }

  @Get(':robotId/runs/:runId/results/export.json')
  @Header('Content-Type', 'application/json; charset=utf-8')
  async exportJson(@Param('robotId') robotId: string, @Param('runId') runId: string, @Req() request: RequestWithUser) {
    const result = await this.list(robotId, runId, '1', '500', request);
    return result.items.map((item) => item.data);
  }

  @Get(':robotId/runs/:runId/results/export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(@Param('robotId') robotId: string, @Param('runId') runId: string, @Req() request: RequestWithUser): Promise<string> {
    const result = await this.list(robotId, runId, '1', '500', request);
    const rows = result.items.map((item) => item.data as Record<string, unknown>);
    const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    return [columns.join(','), ...rows.map((row) => columns.map((column) => escape(row[column])).join(','))].join('\n');
  }

  private requireUser(request: RequestWithUser): SessionUser {
    if (!request.user) throw new UnauthorizedException('Authenticated session required.');
    return request.user;
  }
}
