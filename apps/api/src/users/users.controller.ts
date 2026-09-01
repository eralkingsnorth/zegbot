import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/jwt.guard';
import { PlansService } from '../plans/plans.service';
import { StripeService } from '../stripe/stripe.service';
import { UsersService } from './users.service';

@Controller('admin')
@UseGuards(AdminGuard)
export class UsersAdminController {
  constructor(
    private readonly users: UsersService,
    private readonly plans: PlansService,
    private readonly stripe: StripeService,
  ) {}

  @Get('dashboard')
  dashboard() {
    return this.users.getDashboardStats();
  }

  @Get('users')
  async listUsers() {
    const users = await this.users.listAll();
    const plans = await this.plans.listAll();
    return users.map((user) => {
      const plan = plans.find((p) => p.id === user.planId);
      return { ...user, planName: plan?.name ?? 'Unknown', planSlug: plan?.slug ?? '' };
    });
  }

  @Patch('users/:id/plan')
  async changePlan(@Param('id') id: string, @Body() body: { planId: string }) {
    const user = await this.users.updatePlan(id, body.planId);
    const plan = await this.plans.findById(body.planId);
    if (plan && user.stripeSubscriptionId) {
      await this.stripe.changeUserPlan(user, plan);
    }
    const updated = (await this.users.findById(id))!;
    const planName = plan?.name ?? 'Unknown';
    return { ...updated, planName, planSlug: plan?.slug ?? '' };
  }
}
