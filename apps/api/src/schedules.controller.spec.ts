import { SchedulesController } from './schedules.controller';

describe('SchedulesController', () => {
  const request = { user: { id: 'user-1', email: 'owner@example.com', displayName: 'Owner', workspaceId: 'workspace-1' } };

  it('creates a workspace-scoped schedule with a valid interval', async () => {
    const schedule = { id: 'schedule-1', workspaceId: 'workspace-1', robotId: 'robot-1', intervalMs: 60000, active: true };
    const prisma = {
      robot: { findFirst: jest.fn().mockResolvedValue({ id: 'robot-1' }) },
      schedule: { create: jest.fn().mockResolvedValue(schedule) },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const queue = { upsertSchedule: jest.fn().mockResolvedValue(undefined) };
    const result = await new SchedulesController(prisma as any, audit as any, queue as any).create({ robotId: 'robot-1', intervalMs: 60000 }, request as any);

    expect(result).toEqual(schedule);
    expect(queue.upsertSchedule).toHaveBeenCalledWith('schedule-1', 'robot-1', 60000, true);
  });
});
