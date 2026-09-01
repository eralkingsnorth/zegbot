import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { AdminGuard, JwtAuthGuard } from '../auth/jwt.guard';
import type { AuthPayload } from '../auth/jwt.guard';
import { StripeService } from './stripe.service';

@Controller()
export class StripeController {
  constructor(private readonly stripe: StripeService) {}

  @Post('admin/plans/:id/sync-stripe')
  @UseGuards(AdminGuard)
  syncPlan(@Param('id') id: string) {
    return this.stripe.syncPlanToStripe(id);
  }

  @Post('billing/checkout')
  @UseGuards(JwtAuthGuard)
  checkout(
    @Req() req: Request & { user: AuthPayload },
    @Body() body: { planId: string },
  ) {
    return this.stripe.createCheckoutSession(req.user.sub, body.planId);
  }

  @Post('billing/webhook')
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    return this.stripe.handleWebhook(req, signature);
  }
}
