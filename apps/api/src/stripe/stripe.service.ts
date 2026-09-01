import {
  BadRequestException,
  Injectable,
  Logger,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import type { Request } from 'express';
import type { AppUser, SubscriptionPlan } from '@zegbot/shared';
import { PlansService } from '../plans/plans.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private stripe: Stripe | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly plans: PlansService,
    private readonly users: UsersService,
  ) {
    const key = this.config.get<string>('STRIPE_SECRET_KEY');
    if (key) {
      this.stripe = new Stripe(key);
    }
  }

  private client(): Stripe {
    if (!this.stripe) {
      throw new BadRequestException('Stripe is not configured. Add STRIPE_SECRET_KEY.');
    }
    return this.stripe;
  }

  isConfigured(): boolean {
    return !!this.stripe;
  }

  async syncPlanToStripe(planId: string): Promise<SubscriptionPlan> {
    const plan = await this.plans.findById(planId);
    if (!plan) throw new BadRequestException('Plan not found');
    if (plan.interval === 'free' || plan.price === 0) {
      throw new BadRequestException('Free plans are not synced to Stripe');
    }

    const stripe = this.client();
    let productId = plan.stripeProductId;

    if (!productId) {
      const product = await stripe.products.create({
        name: plan.name,
        description: plan.description,
        metadata: { planId: plan.id, slug: plan.slug },
      });
      productId = product.id;
    } else {
      await stripe.products.update(productId, {
        name: plan.name,
        description: plan.description,
      });
    }

    const interval = plan.interval === 'year' ? 'year' : 'month';
    const price = await stripe.prices.create({
      product: productId,
      unit_amount: Math.round(plan.price * 100),
      currency: plan.currency.toLowerCase(),
      recurring: { interval },
      metadata: { planId: plan.id, slug: plan.slug },
    });

    return this.plans.update(plan.id, {
      stripeProductId: productId,
      stripePriceId: price.id,
    });
  }

  async createCheckoutSession(userId: string, planId: string): Promise<{ url: string }> {
    const user = await this.users.findById(userId);
    const plan = await this.plans.findById(planId);
    if (!user || !plan) throw new BadRequestException('User or plan not found');
    if (!plan.stripePriceId) {
      throw new BadRequestException('Plan is not synced to Stripe yet');
    }

    const stripe = this.client();
    const webUrl = this.config.get<string>('WEB_URL') ?? 'http://localhost:3000';

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await this.users.setStripeIds(user.id, { stripeCustomerId: customerId });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      success_url: `${webUrl}/pricing?success=1`,
      cancel_url: `${webUrl}/pricing?canceled=1`,
      metadata: { userId: user.id, planId: plan.id },
      subscription_data: {
        metadata: { userId: user.id, planId: plan.id },
      },
    });

    if (!session.url) throw new BadRequestException('Could not create checkout session');
    return { url: session.url };
  }

  async changeUserPlan(user: AppUser, plan: SubscriptionPlan): Promise<void> {
    if (!this.stripe || !user.stripeSubscriptionId) return;

    if (plan.interval === 'free' || plan.price === 0) {
      await this.stripe.subscriptions.cancel(user.stripeSubscriptionId);
      await this.users.setStripeIds(user.id, {
        stripeSubscriptionId: null,
        subscriptionStatus: 'canceled',
      });
      return;
    }

    if (!plan.stripePriceId) {
      throw new BadRequestException('Target plan is not synced to Stripe');
    }

    const sub = await this.stripe.subscriptions.retrieve(user.stripeSubscriptionId);
    const itemId = sub.items.data[0]?.id;
    if (!itemId) throw new BadRequestException('Subscription item not found');

    await this.stripe.subscriptions.update(user.stripeSubscriptionId, {
      items: [{ id: itemId, price: plan.stripePriceId }],
      proration_behavior: 'create_prorations',
    });
  }

  async handleWebhook(req: RawBodyRequest<Request>, signature: string | undefined) {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!secret) throw new BadRequestException('Webhook secret not configured');
    if (!signature) throw new BadRequestException('Missing stripe signature');

    const stripe = this.client();
    const event = stripe.webhooks.constructEvent(req.rawBody as Buffer, signature, secret);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const planId = session.metadata?.planId;
        const subscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id ?? null;

        if (userId && planId) {
          await this.users.setStripeIds(userId, {
            planId,
            stripeSubscriptionId: subscriptionId,
            subscriptionStatus: 'active',
          });
        }
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.userId;
        const planId = sub.metadata?.planId;
        if (userId) {
          await this.users.setStripeIds(userId, {
            planId: planId ?? undefined,
            stripeSubscriptionId: sub.id,
            subscriptionStatus: sub.status as AppUser['subscriptionStatus'],
          });
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.userId;
        if (userId) {
          const free = await this.plans.findFree();
          await this.users.setStripeIds(userId, {
            planId: free?.id,
            stripeSubscriptionId: null,
            subscriptionStatus: 'canceled',
          });
        }
        break;
      }
      default:
        this.logger.debug(`Unhandled Stripe event: ${event.type}`);
    }

    return { received: true };
  }
}
