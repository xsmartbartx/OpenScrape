import { RobotStepsController } from './robot-steps.controller';

describe('RobotStepsController', () => {
  it('appends an ordered selector step inside the current workspace', async () => {
    const prisma = {
      robot: { findFirst: jest.fn().mockResolvedValue({ id: 'robot-1' }) },
      robotStep: {
        findFirst: jest.fn().mockResolvedValue({ orderIndex: 2 }),
        create: jest.fn().mockResolvedValue({ id: 'step-1', robotId: 'robot-1', orderIndex: 3, action: 'click' }),
      },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const controller = new RobotStepsController(prisma as any, audit as any);

    const result = await controller.create('robot-1', { action: 'click', selector: { candidates: [{ value: '#buy', score: 95 }] } }, {
      user: { id: 'user-1', email: 'owner@example.com', displayName: 'Owner', workspaceId: 'workspace-1' },
    } as any);

    expect(result).toMatchObject({ id: 'step-1', orderIndex: 3 });
    expect(prisma.robotStep.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ robotId: 'robot-1', orderIndex: 3, action: 'click' }),
    }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'robot_step.create' }));
  });
});
