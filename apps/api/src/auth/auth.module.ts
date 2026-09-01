import { Module, forwardRef } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AuthGuardsModule } from './auth-guards.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionsService } from './sessions.service';

@Module({
  imports: [AuthGuardsModule, forwardRef(() => UsersModule)],
  controllers: [AuthController],
  providers: [AuthService, SessionsService],
  exports: [AuthService, SessionsService, AuthGuardsModule],
})
export class AuthModule {}
