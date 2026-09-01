import { Injectable, Logger, OnModuleDestroy, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export type SessionRole = 'admin' | 'user';

export interface IssuedRefreshToken {
  refreshToken: string;
  expiresAt: Date;
}

export interface RotatedSession extends IssuedRefreshToken {
  userId: string;
  role: SessionRole;
}

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

const hash = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

@Injectable()
export class SessionsService implements OnModuleDestroy {
  private readonly logger = new Logger(SessionsService.name);
  private readonly ttlDays: number;
  private cleanupTimer: NodeJS.Timeout;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const raw = Number(this.config.get('REFRESH_TOKEN_TTL_DAYS'));
    this.ttlDays = Number.isFinite(raw) && raw > 0 ? raw : 60;

    this.cleanupTimer = setInterval(() => void this.cleanup(), CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref?.();
  }

  onModuleDestroy() {
    clearInterval(this.cleanupTimer);
  }

  ttlMs(): number {
    return this.ttlDays * 24 * 60 * 60 * 1000;
  }

  async issue(
    userId: string,
    role: SessionRole,
    device?: string,
  ): Promise<IssuedRefreshToken> {
    const { refreshToken, expiresAt } = await this.createSession(userId, role, device);
    return { refreshToken, expiresAt };
  }

  private async createSession(userId: string, role: SessionRole, device?: string) {
    const refreshToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.ttlMs());

    const row = await this.prisma.session.create({
      data: {
        tokenHash: hash(refreshToken),
        userId,
        role,
        device: device?.slice(0, 255),
        expiresAt,
      },
      select: { id: true },
    });

    return { refreshToken, expiresAt, id: row.id };
  }

  /**
   * Swaps a refresh token for a fresh one and slides the expiry forward.
   * Presenting an already-rotated token means it leaked, so every session for
   * that account is killed rather than just refusing this one request.
   */
  async rotate(refreshToken: string, device?: string): Promise<RotatedSession> {
    const existing = await this.prisma.session.findUnique({
      where: { tokenHash: hash(refreshToken) },
    });

    if (!existing) throw new UnauthorizedException('Session not found');

    if (existing.revokedAt) {
      this.logger.warn(
        `Reused refresh token for ${existing.userId}; revoking all their sessions`,
      );
      await this.revokeAll(existing.userId);
      throw new UnauthorizedException('Session expired, please log in again');
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      await this.prisma.session.delete({ where: { id: existing.id } });
      throw new UnauthorizedException('Session expired, please log in again');
    }

    const role: SessionRole = existing.role === 'admin' ? 'admin' : 'user';
    const next = await this.createSession(
      existing.userId,
      role,
      device ?? existing.device ?? undefined,
    );

    await this.prisma.session.update({
      where: { id: existing.id },
      data: {
        revokedAt: new Date(),
        lastUsedAt: new Date(),
        replacedById: next.id,
      },
    });

    return {
      refreshToken: next.refreshToken,
      expiresAt: next.expiresAt,
      userId: existing.userId,
      role,
    };
  }

  async revoke(refreshToken: string): Promise<void> {
    await this.prisma.session
      .updateMany({
        where: { tokenHash: hash(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
  }

  async revokeAll(userId: string): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  /** Drops rows that are long past use so the table does not grow forever. */
  private async cleanup(): Promise<void> {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    try {
      await this.prisma.session.deleteMany({
        where: {
          OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: cutoff } }],
        },
      });
    } catch (err) {
      this.logger.debug(
        `Session cleanup skipped: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
