import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AdminGuard, JwtAuthGuard } from './jwt.guard';

export function accessTokenTtlSeconds(config: ConfigService): number {
  const raw = Number(config.get('JWT_ACCESS_TTL_SECONDS'));
  return Number.isFinite(raw) && raw > 0 ? raw : 15 * 60;
}

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'zegbot-dev-secret',
        // Deliberately short: sessions are kept alive by the refresh token, so a
        // leaked access token is only useful for minutes.
        signOptions: { expiresIn: accessTokenTtlSeconds(config) },
      }),
    }),
  ],
  providers: [JwtAuthGuard, AdminGuard],
  exports: [JwtModule, JwtAuthGuard, AdminGuard],
})
export class AuthGuardsModule {}
