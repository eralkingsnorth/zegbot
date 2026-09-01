import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';
import type {
  CreatePlanRequest,
  PlanInterval,
  SubscriptionPlan,
  UpdatePlanRequest,
} from '@zegbot/shared';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_PLANS: Omit<SubscriptionPlan, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Free',
    slug: 'free',
    price: 0,
    currency: 'USD',
    interval: 'free',
    description: 'Try Zegbot with text chat.',
    features: ['10 text asks per day', 'WhatsApp connect', 'Basic AI replies'],
    voiceUsesPerMonth: 0,
    textUsesPerDay: 10,
    active: true,
    popular: false,
    sortOrder: 0,
    stripeProductId: null,
    stripePriceId: null,
  },
  {
    name: 'Starter',
    slug: 'starter',
    price: 4.99,
    currency: 'USD',
    interval: 'month',
    description: 'Light daily use with some voice.',
    features: [
      'Unlimited text chat',
      '50 voice uses per month',
      'WhatsApp send & read',
    ],
    voiceUsesPerMonth: 50,
    textUsesPerDay: null,
    active: true,
    popular: false,
    sortOrder: 1,
    stripeProductId: null,
    stripePriceId: null,
  },
  {
    name: 'Pro',
    slug: 'pro',
    price: 9.99,
    currency: 'USD',
    interval: 'month',
    description: 'Best for daily voice + messaging.',
    features: [
      'Unlimited text chat',
      'Unlimited voice',
      'Priority AI responses',
      'All channels',
    ],
    voiceUsesPerMonth: null,
    textUsesPerDay: null,
    active: true,
    popular: true,
    sortOrder: 2,
    stripeProductId: null,
    stripePriceId: null,
  },
  {
    name: 'Annual Pro',
    slug: 'annual-pro',
    price: 79,
    currency: 'USD',
    interval: 'year',
    description: 'Pro features, billed once per year.',
    features: ['Everything in Pro', 'Save ~34% vs monthly', 'Unlimited voice'],
    voiceUsesPerMonth: null,
    textUsesPerDay: null,
    active: true,
    popular: false,
    sortOrder: 3,
    stripeProductId: null,
    stripePriceId: null,
  },
];

@Injectable()
export class PlansService implements OnModuleInit {
  private readonly logger = new Logger(PlansService.name);
  private readonly jsonPath: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const configured = this.config.get<string>('PLANS_DATA_FILE');
    this.jsonPath =
      configured ?? join(process.cwd(), '..', '..', 'data', 'plans.json');
  }

  async onModuleInit() {
    const count = await this.prisma.plan.count();
    if (count > 0) return;

    const fromJson = await this.readJsonPlans();
    if (fromJson.length > 0) {
      this.logger.log(`Migrating ${fromJson.length} plans from JSON into MySQL`);
      for (const plan of fromJson) {
        await this.prisma.plan.create({ data: this.toCreateInput(plan) });
      }
      return;
    }

    this.logger.log('Seeding default subscription plans');
    const now = new Date();
    for (const plan of DEFAULT_PLANS) {
      await this.prisma.plan.create({
        data: {
          id: randomUUID(),
          ...plan,
          features: plan.features,
          createdAt: now,
          updatedAt: now,
        },
      });
    }
  }

  private async readJsonPlans(): Promise<SubscriptionPlan[]> {
    try {
      const raw = await readFile(this.jsonPath, 'utf8');
      return JSON.parse(raw) as SubscriptionPlan[];
    } catch {
      return [];
    }
  }

  private toCreateInput(plan: SubscriptionPlan): Prisma.PlanCreateInput {
    return {
      id: plan.id,
      name: plan.name,
      slug: plan.slug,
      price: plan.price,
      currency: plan.currency,
      interval: plan.interval,
      description: plan.description,
      features: plan.features,
      voiceUsesPerMonth: plan.voiceUsesPerMonth,
      textUsesPerDay: plan.textUsesPerDay,
      active: plan.active,
      popular: plan.popular,
      sortOrder: plan.sortOrder,
      stripeProductId: plan.stripeProductId,
      stripePriceId: plan.stripePriceId,
      createdAt: new Date(plan.createdAt),
      updatedAt: new Date(plan.updatedAt),
    };
  }

  private toPublic(plan: {
    id: string;
    name: string;
    slug: string;
    price: number;
    currency: string;
    interval: string;
    description: string;
    features: Prisma.JsonValue;
    voiceUsesPerMonth: number | null;
    textUsesPerDay: number | null;
    active: boolean;
    popular: boolean;
    sortOrder: number;
    stripeProductId: string | null;
    stripePriceId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): SubscriptionPlan {
    const features = Array.isArray(plan.features)
      ? (plan.features as string[])
      : [];
    return {
      id: plan.id,
      name: plan.name,
      slug: plan.slug,
      price: plan.price,
      currency: plan.currency,
      interval: plan.interval as PlanInterval,
      description: plan.description,
      features,
      voiceUsesPerMonth: plan.voiceUsesPerMonth,
      textUsesPerDay: plan.textUsesPerDay,
      active: plan.active,
      popular: plan.popular,
      sortOrder: plan.sortOrder,
      stripeProductId: plan.stripeProductId,
      stripePriceId: plan.stripePriceId,
      createdAt: plan.createdAt.toISOString(),
      updatedAt: plan.updatedAt.toISOString(),
    };
  }

  async listPublic(): Promise<SubscriptionPlan[]> {
    const plans = await this.prisma.plan.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
    });
    return plans.map((p) => this.toPublic(p));
  }

  async listAll(): Promise<SubscriptionPlan[]> {
    const plans = await this.prisma.plan.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    return plans.map((p) => this.toPublic(p));
  }

  async findById(id: string): Promise<SubscriptionPlan | null> {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    return plan ? this.toPublic(plan) : null;
  }

  async findFree(): Promise<SubscriptionPlan | null> {
    const plan = await this.prisma.plan.findFirst({
      where: { OR: [{ slug: 'free' }, { price: 0 }] },
      orderBy: { sortOrder: 'asc' },
    });
    return plan ? this.toPublic(plan) : null;
  }

  async create(input: CreatePlanRequest): Promise<SubscriptionPlan> {
    const count = await this.prisma.plan.count();
    const plan = await this.prisma.plan.create({
      data: {
        name: input.name.trim(),
        slug: input.slug.trim().toLowerCase(),
        price: input.price,
        currency: input.currency ?? 'USD',
        interval: input.interval,
        description: input.description.trim(),
        features: input.features.map((f) => f.trim()).filter(Boolean),
        voiceUsesPerMonth: input.voiceUsesPerMonth ?? null,
        textUsesPerDay: input.textUsesPerDay ?? null,
        active: input.active ?? true,
        popular: input.popular ?? false,
        sortOrder: input.sortOrder ?? count,
      },
    });
    return this.toPublic(plan);
  }

  async update(id: string, input: UpdatePlanRequest): Promise<SubscriptionPlan> {
    const current = await this.prisma.plan.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Plan not found');

    const plan = await this.prisma.plan.update({
      where: { id },
      data: {
        name: input.name?.trim() ?? current.name,
        slug: input.slug?.trim().toLowerCase() ?? current.slug,
        price: input.price ?? current.price,
        currency: input.currency ?? current.currency,
        interval: input.interval ?? current.interval,
        description: input.description?.trim() ?? current.description,
        features: input.features
          ? input.features.map((f) => f.trim()).filter(Boolean)
          : undefined,
        voiceUsesPerMonth:
          input.voiceUsesPerMonth === undefined
            ? current.voiceUsesPerMonth
            : input.voiceUsesPerMonth,
        textUsesPerDay:
          input.textUsesPerDay === undefined
            ? current.textUsesPerDay
            : input.textUsesPerDay,
        active: input.active ?? current.active,
        popular: input.popular ?? current.popular,
        sortOrder: input.sortOrder ?? current.sortOrder,
        stripeProductId:
          input.stripeProductId === undefined
            ? current.stripeProductId
            : input.stripeProductId,
        stripePriceId:
          input.stripePriceId === undefined
            ? current.stripePriceId
            : input.stripePriceId,
      },
    });
    return this.toPublic(plan);
  }

  async remove(id: string): Promise<void> {
    const current = await this.prisma.plan.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Plan not found');
    await this.prisma.plan.delete({ where: { id } });
  }
}
