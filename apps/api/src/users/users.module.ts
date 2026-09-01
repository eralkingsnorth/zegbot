import { Module, forwardRef } from '@nestjs/common';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { PlansModule } from '../plans/plans.module';
import { StripeModule } from '../stripe/stripe.module';
import { UsersAdminController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    PlansModule,
    AuthGuardsModule,
    forwardRef(() => StripeModule),
  ],
  controllers: [UsersAdminController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
