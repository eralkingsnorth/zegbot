import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { readFile } from 'fs/promises';
import type {
  AdminDashboardStats,
  AppUser,
  AuthMeResponse,
  AuthRegisterRequest,
  MessageChannel,
  OnboardingStep,
  OnboardingUpdateRequest,
  UserSubscriptionStatus,
} from '@zegbot/shared';
import { hashPassword, verifyPassword } from '../common/password';
import { PlansService } from '../plans/plans.service';
import { PrismaService } from '../prisma/prisma.service';

interface JsonUser {
  id: string;
  email: string;
  name: string;
  planId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: UserSubscriptionStatus;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
  emailVerified?: boolean;
}

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);
  private readonly jsonPath: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly plans: PlansService,
  ) {
    const dataDir =
      this.config.get<string>('DATA_DIR') ?? join(process.cwd(), '..', '..', 'data');
    this.jsonPath = join(dataDir, 'users.json');
  }

  async onModuleInit() {
    const count = await this.prisma.user.count();
    if (count > 0) return;

    const fromJson = await this.readJsonUsers();
    if (fromJson.length === 0) return;

    const free = await this.plans.findFree();
    this.logger.log(`Migrating ${fromJson.length} users from JSON into MySQL`);
    for (const user of fromJson) {
      const plan = (await this.plans.findById(user.planId)) ?? free;
      if (!plan) {
        this.logger.warn(`Skipping user ${user.email}: no plan available`);
        continue;
      }
      await this.prisma.user.create({
        data: {
          id: user.id,
          email: user.email,
          name: user.name,
          passwordHash: user.passwordHash,
          emailVerified: user.emailVerified ?? true,
          planId: plan.id,
          stripeCustomerId: user.stripeCustomerId,
          stripeSubscriptionId: user.stripeSubscriptionId,
          subscriptionStatus: user.subscriptionStatus,
          createdAt: new Date(user.createdAt),
          updatedAt: new Date(user.updatedAt),
        },
      });
    }
  }

  private async readJsonUsers(): Promise<JsonUser[]> {
    try {
      const raw = await readFile(this.jsonPath, 'utf8');
      return JSON.parse(raw) as JsonUser[];
    } catch {
      return [];
    }
  }

  private toPublic(user: {
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
    planId: string;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    subscriptionStatus: string;
    createdAt: Date;
    updatedAt: Date;
  }): AppUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
      planId: user.planId,
      stripeCustomerId: user.stripeCustomerId,
      stripeSubscriptionId: user.stripeSubscriptionId,
      subscriptionStatus: user.subscriptionStatus as UserSubscriptionStatus,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  private async freePlanId(): Promise<string> {
    const free = await this.plans.findFree();
    if (!free) throw new NotFoundException('Free plan not found');
    return free.id;
  }

  async register(
    body: AuthRegisterRequest,
  ): Promise<{ user: AppUser; verifyToken: string; verifyCode: string }> {
    const email = body.email.trim().toLowerCase();
    if (!email || !body.password) {
      throw new BadRequestException('Email and password are required');
    }
    if (body.password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');

    const verifyToken = randomBytes(32).toString('hex');
    const verifyCode = String(Math.floor(100000 + Math.random() * 900000));
    const user = await this.prisma.user.create({
      data: {
        email,
        name: body.name.trim() || email.split('@')[0],
        passwordHash: hashPassword(body.password),
        emailVerified: false,
        emailVerifyToken: verifyToken,
        emailVerifyCode: verifyCode,
        emailVerifyExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
        planId: await this.freePlanId(),
        subscriptionStatus: 'none',
        onboardingCompleted: false,
        onboardingStep: 'channel',
        onboardingChannel: null,
      },
    });

    return { user: this.toPublic(user), verifyToken, verifyCode };
  }

  async login(email: string, password: string): Promise<AppUser> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!user.emailVerified) {
      throw new ForbiddenException('Please verify your email before logging in');
    }
    return this.toPublic(user);
  }

  async verifyEmail(token: string): Promise<AppUser> {
    if (!token) throw new BadRequestException('Missing verification token');
    const user = await this.prisma.user.findFirst({
      where: {
        emailVerifyToken: token,
        emailVerifyExpires: { gt: new Date() },
      },
    });
    if (!user) {
      throw new BadRequestException('Invalid or expired verification link');
    }

    return this.markEmailVerified(user.id);
  }

  async verifyEmailCode(email: string, code: string): Promise<AppUser> {
    const trimmed = email.trim().toLowerCase();
    const digits = code.replace(/\D/g, '');
    if (!trimmed || digits.length !== 6) {
      throw new BadRequestException('Email and 6-digit code are required');
    }
    const user = await this.prisma.user.findFirst({
      where: {
        email: trimmed,
        emailVerifyCode: digits,
        emailVerifyExpires: { gt: new Date() },
      },
    });
    if (!user) {
      throw new BadRequestException('Invalid or expired verification code');
    }
    return this.markEmailVerified(user.id);
  }

  async resendVerification(
    email: string,
  ): Promise<{ email: string; verifyToken: string; verifyCode: string } | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!user || user.emailVerified) return null;

    const verifyToken = randomBytes(32).toString('hex');
    const verifyCode = String(Math.floor(100000 + Math.random() * 900000));
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifyToken: verifyToken,
        emailVerifyCode: verifyCode,
        emailVerifyExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    return { email: user.email, verifyToken, verifyCode };
  }

  private async markEmailVerified(id: string): Promise<AppUser> {
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        emailVerified: true,
        emailVerifyToken: null,
        emailVerifyCode: null,
        emailVerifyExpires: null,
      },
    });
    return this.toPublic(updated);
  }

  async setResetToken(
    email: string,
  ): Promise<{ email: string; token: string } | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!user) return null;

    const token = randomBytes(32).toString('hex');
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: token,
        resetExpires: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    return { email: user.email, token };
  }

  async resetPassword(token: string, password: string): Promise<void> {
    if (!token || !password) {
      throw new BadRequestException('Token and password are required');
    }
    if (password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        resetToken: token,
        resetExpires: { gt: new Date() },
      },
    });
    if (!user) {
      throw new BadRequestException('Invalid or expired reset link');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashPassword(password),
        resetToken: null,
        resetExpires: null,
      },
    });
  }

  async getMe(id: string): Promise<AuthMeResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { plan: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const step = (user.onboardingStep as OnboardingStep) || 'done';
    const channel = user.onboardingChannel as MessageChannel | null;
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
      planId: user.planId,
      planName: user.plan.name,
      planSlug: user.plan.slug,
      subscriptionStatus: user.subscriptionStatus as UserSubscriptionStatus,
      onboardingCompleted: user.onboardingCompleted !== false,
      onboardingStep: step,
      onboardingChannel: channel || null,
      aiTone: user.aiTone,
      aiAutoReply: user.aiAutoReply,
    };
  }

  async updateOnboarding(
    userId: string,
    body: OnboardingUpdateRequest,
  ): Promise<AuthMeResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const data: {
      onboardingStep?: string;
      onboardingCompleted?: boolean;
      onboardingChannel?: string | null;
      aiTone?: string;
      aiAutoReply?: boolean;
    } = {};

    if (body.step) data.onboardingStep = body.step;
    if (body.channel !== undefined) data.onboardingChannel = body.channel;
    if (typeof body.aiTone === 'string') data.aiTone = body.aiTone;
    if (typeof body.aiAutoReply === 'boolean') data.aiAutoReply = body.aiAutoReply;
    if (body.completed) {
      data.onboardingCompleted = true;
      data.onboardingStep = 'done';
    } else if (body.completed === false) {
      data.onboardingCompleted = false;
    }

    await this.prisma.user.update({ where: { id: userId }, data });
    return this.getMe(userId);
  }

  async listAll(): Promise<AppUser[]> {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return users.map((u) => this.toPublic(u));
  }

  async findById(id: string): Promise<AppUser | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user ? this.toPublic(user) : null;
  }

  async findByEmail(email: string): Promise<AppUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    return user ? this.toPublic(user) : null;
  }

  async updatePlan(userId: string, planId: string): Promise<AppUser> {
    const plan = await this.plans.findById(planId);
    if (!plan) throw new NotFoundException('Plan not found');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        planId,
        subscriptionStatus: plan.price === 0 ? 'none' : 'active',
      },
    });
    return this.toPublic(updated);
  }

  async setStripeIds(
    userId: string,
    data: {
      stripeCustomerId?: string | null;
      stripeSubscriptionId?: string | null;
      subscriptionStatus?: UserSubscriptionStatus;
      planId?: string;
    },
  ): Promise<AppUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
    });
    return this.toPublic(updated);
  }

  async getDashboardStats(): Promise<AdminDashboardStats> {
    const plans = await this.plans.listAll();
    const users = await this.listAll();
    const byPlan = plans.map((plan) => ({
      planId: plan.id,
      planName: plan.name,
      count: users.filter((u) => u.planId === plan.id).length,
    }));

    const estimatedMrr = users.reduce((sum, user) => {
      const plan = plans.find((p) => p.id === user.planId);
      if (!plan || plan.price === 0) return sum;
      if (user.subscriptionStatus !== 'active' && user.subscriptionStatus !== 'trialing') {
        return sum;
      }
      if (plan.interval === 'year') return sum + plan.price / 12;
      if (plan.interval === 'month') return sum + plan.price;
      return sum;
    }, 0);

    return {
      totalUsers: users.length,
      activeSubscriptions: users.filter(
        (u) => u.subscriptionStatus === 'active' || u.subscriptionStatus === 'trialing',
      ).length,
      usersByPlan: byPlan,
      estimatedMrr: Math.round(estimatedMrr * 100) / 100,
    };
  }
}
