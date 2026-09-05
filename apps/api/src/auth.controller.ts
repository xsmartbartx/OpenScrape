import { ConflictException, Controller, Post, Body, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { PrismaService } from './prisma.service';

const scrypt = promisify(scryptCallback);
const sessionLifetimeMs = 1000 * 60 * 60 * 24 * 30;

type AuthInput = {
  email?: string;
  password?: string;
  displayName?: string;
};

@Controller('auth')
export class AuthController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('register')
  async register(@Body() body: AuthInput) {
    const email = this.normalizeEmail(body.email);
    const password = this.requirePassword(body.password);
    const displayName = body.displayName?.trim() || email.split('@')[0];
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('An account with this email already exists.');

    const user = await this.prisma.user.create({
      data: {
        id: `user-${randomBytes(12).toString('hex')}`,
        email,
        displayName,
        passwordHash: await this.hashPassword(password),
      },
    });

    const workspace = await this.prisma.workspace.create({
      data: {
        id: `workspace-${randomBytes(12).toString('hex')}`,
        name: `${displayName}'s workspace`,
        memberships: { create: { userId: user.id, role: 'owner' } },
      },
    });

    return this.createSession(user.id, workspace.id, user.email, user.displayName);
  }

  @Post('login')
  async login(@Body() body: AuthInput) {
    const email = this.normalizeEmail(body.email);
    const password = this.requirePassword(body.password);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !(await this.verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const membership = await this.prisma.membership.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
    });
    if (!membership) throw new UnauthorizedException('Account has no workspace membership.');

    return this.createSession(user.id, membership.workspaceId, user.email, user.displayName);
  }

  private async createSession(userId: string, workspaceId: string, email: string, displayName: string) {
    const token = randomBytes(32).toString('base64url');
    await this.prisma.session.create({
      data: {
        id: `session-${randomBytes(12).toString('hex')}`,
        tokenHash: this.hashToken(token),
        userId,
        expiresAt: new Date(Date.now() + sessionLifetimeMs),
      },
    });

    return { token, expiresInSeconds: sessionLifetimeMs / 1000, user: { id: userId, email, displayName, workspaceId } };
  }

  private normalizeEmail(value?: string): string {
    const email = value?.trim().toLowerCase() ?? '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UnauthorizedException('A valid email is required.');
    return email;
  }

  private requirePassword(value?: string): string {
    if (!value || value.length < 12) throw new UnauthorizedException('Password must contain at least 12 characters.');
    return value;
  }

  private async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const derived = await scrypt(password, salt, 64) as Buffer;
    return `scrypt$${salt}$${derived.toString('hex')}`;
  }

  private async verifyPassword(password: string, encoded: string): Promise<boolean> {
    const [, salt, expectedHex] = encoded.split('$');
    if (!salt || !expectedHex) return false;
    const expected = Buffer.from(expectedHex, 'hex');
    const actual = await scrypt(password, salt, expected.length) as Buffer;
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
