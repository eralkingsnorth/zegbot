import {
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type {
  AuthLoginRequest,
  AuthRegisterRequest,
  AuthRegisterResponse,
  AuthResponse,
} from '@zegbot/shared';
import { JsonStore } from '../common/json-store';
import { hashPassword, verifyPassword } from '../common/password';
import { EmailService } from '../email/email.service';
import { UsersService } from '../users/users.service';
import { accessTokenTtlSeconds } from './auth-guards.module';
import { SessionsService, type SessionRole } from './sessions.service';

interface AdminRecord {
  id: string;
  email: string;
  passwordHash: string;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private admin: AdminRecord | null = null;
  private readonly store: JsonStore<AdminRecord>;

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    private readonly email: EmailService,
    private readonly sessions: SessionsService,
  ) {
    const dataDir =
      this.config.get<string>('DATA_DIR') ?? join(process.cwd(), '..', '..', 'data');
    this.store = new JsonStore<AdminRecord>(join(dataDir, 'admin.json'));
  }

  async onModuleInit() {
    this.admin = await this.store.read();
    if (!this.admin) {
      const email = this.config.get<string>('ADMIN_EMAIL') ?? 'admin@zegbot.local';
      const password = this.config.get<string>('ADMIN_PASSWORD') ?? 'admin123';
      this.admin = {
        id: randomUUID(),
        email: email.toLowerCase(),
        passwordHash: hashPassword(password),
      };
      await this.store.write(this.admin);
      this.logger.log(`Admin account created for ${email}`);
    }
  }

  private webUrl(): string {
    return this.config.get<string>('WEB_URL') ?? 'http://localhost:3000';
  }

  async adminLogin(body: AuthLoginRequest, device?: string): Promise<AuthResponse> {
    if (!this.admin) {
      throw new UnauthorizedException('Admin not configured');
    }
    const email = body.email.trim().toLowerCase();
    if (email !== this.admin.email || !verifyPassword(body.password, this.admin.passwordHash)) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.buildSession(
      { id: this.admin.id, email, name: 'Admin' },
      'admin',
      device,
    );
  }

  async userRegister(body: AuthRegisterRequest): Promise<AuthRegisterResponse> {
    const { user, verifyToken, verifyCode } = await this.users.register(body);
    const link = `${this.webUrl()}/verify-email?token=${verifyToken}`;
    await this.email.sendVerification(user.email, link, verifyCode);
    return { message: 'Check your email to verify your account.' };
  }

  async userLogin(body: AuthLoginRequest, device?: string): Promise<AuthResponse> {
    const user = await this.users.login(body.email, body.password);
    return this.buildSession(user, 'user', device);
  }

  async verifyEmail(token: string, device?: string): Promise<AuthResponse> {
    const user = await this.users.verifyEmail(token);
    return this.buildSession(user, 'user', device);
  }

  async verifyEmailCode(
    email: string,
    code: string,
    device?: string,
  ): Promise<AuthResponse> {
    const user = await this.users.verifyEmailCode(email, code);
    return this.buildSession(user, 'user', device);
  }

  async resendVerification(email: string): Promise<{ message: string }> {
    const result = await this.users.resendVerification(email);
    if (result) {
      const link = `${this.webUrl()}/verify-email?token=${result.verifyToken}`;
      await this.email.sendVerification(result.email, link, result.verifyCode);
    }
    return { message: 'If that email is unverified, we sent a new code.' };
  }

  private async buildSession(
    user: { id: string; email: string; name: string },
    role: SessionRole,
    device?: string,
  ): Promise<AuthResponse> {
    const { refreshToken } = await this.sessions.issue(user.id, role, device);
    return {
      token: this.signToken(user.id, role, user.email),
      expiresIn: accessTokenTtlSeconds(this.config),
      refreshToken,
      user: { id: user.id, email: user.email, name: user.name, role },
    };
  }

  /** Exchanges a refresh token for a new access token and a rotated refresh token. */
  async refresh(refreshToken: string, device?: string) {
    const rotated = await this.sessions.rotate(refreshToken, device);
    const email = await this.emailFor(rotated.userId, rotated.role);
    return {
      token: this.signToken(rotated.userId, rotated.role, email),
      expiresIn: accessTokenTtlSeconds(this.config),
      refreshToken: rotated.refreshToken,
      role: rotated.role,
    };
  }

  async logout(refreshToken: string): Promise<{ message: string }> {
    await this.sessions.revoke(refreshToken);
    return { message: 'Logged out.' };
  }

  async logoutAll(userId: string): Promise<{ message: string; sessions: number }> {
    const sessions = await this.sessions.revokeAll(userId);
    return { message: 'Logged out on all devices.', sessions };
  }

  private async emailFor(userId: string, role: SessionRole): Promise<string> {
    if (role === 'admin') return this.admin?.email ?? 'admin';
    try {
      const me = await this.users.getMe(userId);
      return me.email;
    } catch {
      throw new UnauthorizedException('Account no longer exists');
    }
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const result = await this.users.setResetToken(email);
    if (result) {
      const link = `${this.webUrl()}/reset-password?token=${result.token}`;
      await this.email.sendPasswordReset(result.email, link);
    }
    return { message: 'If that email is registered, we sent a reset link.' };
  }

  async resetPassword(token: string, password: string): Promise<{ message: string }> {
    await this.users.resetPassword(token, password);
    return { message: 'Password updated. You can log in now.' };
  }

  signToken(id: string, role: 'admin' | 'user', email: string): string {
    return this.jwt.sign({ sub: id, role, email });
  }
}
