import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AuthForgotPasswordRequest,
  AuthLoginRequest,
  AuthRefreshRequest,
  AuthRegisterRequest,
  AuthResetPasswordRequest,
  AuthResendVerificationRequest,
  AuthResponse,
  AuthScope,
  AuthVerifyEmailCodeRequest,
  AuthVerifyEmailRequest,
  OnboardingUpdateRequest,
} from '@zegbot/shared';
import type { Request, Response } from 'express';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import {
  clearRefreshCookie,
  deviceLabel,
  readRefreshCookie,
  setRefreshCookie,
} from './cookies';
import { JwtAuthGuard, type AuthPayload } from './jwt.guard';
import { SessionsService } from './sessions.service';

/**
 * Native clients identify themselves so they receive the refresh token in the
 * body. Browsers get it as an httpOnly cookie instead, where scripts (and any
 * XSS) cannot read it.
 */
const isNativeClient = (req: Request): boolean =>
  String(req.headers['x-zegbot-client'] ?? '').toLowerCase() === 'native';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
    private readonly config: ConfigService,
  ) {}

  /** Delivers the refresh token by cookie or body depending on the client. */
  private deliver(
    req: Request,
    res: Response,
    result: AuthResponse,
    scope: AuthScope,
  ): AuthResponse {
    const { refreshToken, ...rest } = result;

    if (isNativeClient(req)) {
      return { ...rest, refreshToken };
    }
    if (refreshToken) {
      setRefreshCookie(res, this.config, scope, refreshToken, this.sessions.ttlMs());
    }
    return rest;
  }

  @Post('register')
  register(@Body() body: AuthRegisterRequest) {
    return this.auth.userRegister(body);
  }

  @Post('login')
  async login(
    @Body() body: AuthLoginRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.userLogin(body, deviceLabel(req));
    return this.deliver(req, res, result, 'user');
  }

  @Post('verify-email')
  async verifyEmail(
    @Body() body: AuthVerifyEmailRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.verifyEmail(body.token, deviceLabel(req));
    return this.deliver(req, res, result, 'user');
  }

  @Post('verify-email-code')
  async verifyEmailCode(
    @Body() body: AuthVerifyEmailCodeRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.verifyEmailCode(
      body.email,
      body.code,
      deviceLabel(req),
    );
    return this.deliver(req, res, result, 'user');
  }

  @Post('refresh')
  async refresh(
    @Body() body: AuthRefreshRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const scope: AuthScope = body?.scope === 'admin' ? 'admin' : 'user';
    const token = body?.refreshToken ?? readRefreshCookie(req, scope);
    if (!token) throw new UnauthorizedException('No session');

    const rotated = await this.auth.refresh(token, deviceLabel(req));
    const payload = {
      token: rotated.token,
      expiresIn: rotated.expiresIn,
      refreshToken: rotated.refreshToken,
    };

    if (isNativeClient(req)) return payload;

    setRefreshCookie(
      res,
      this.config,
      rotated.role,
      rotated.refreshToken,
      this.sessions.ttlMs(),
    );
    return { token: payload.token, expiresIn: payload.expiresIn };
  }

  @Post('logout')
  async logout(
    @Body() body: AuthRefreshRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const scope: AuthScope = body?.scope === 'admin' ? 'admin' : 'user';
    const token = body?.refreshToken ?? readRefreshCookie(req, scope);
    if (token) await this.auth.logout(token);
    if (!isNativeClient(req)) clearRefreshCookie(res, this.config, scope);
    return { message: 'Logged out.' };
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  async logoutAll(
    @Req() req: Request & { user: AuthPayload },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.logoutAll(req.user.sub);
    if (!isNativeClient(req)) {
      clearRefreshCookie(res, this.config, req.user.role);
    }
    return result;
  }

  @Post('resend-verification')
  resendVerification(@Body() body: AuthResendVerificationRequest) {
    return this.auth.resendVerification(body.email);
  }

  @Post('forgot-password')
  forgotPassword(@Body() body: AuthForgotPasswordRequest) {
    return this.auth.forgotPassword(body.email);
  }

  @Post('reset-password')
  resetPassword(@Body() body: AuthResetPasswordRequest) {
    return this.auth.resetPassword(body.token, body.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: Request & { user: AuthPayload }) {
    return this.users.getMe(req.user.sub);
  }

  @Patch('onboarding')
  @UseGuards(JwtAuthGuard)
  onboarding(
    @Req() req: Request & { user: AuthPayload },
    @Body() body: OnboardingUpdateRequest,
  ) {
    return this.users.updateOnboarding(req.user.sub, body);
  }

  @Post('admin/login')
  async adminLogin(
    @Body() body: AuthLoginRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.adminLogin(body, deviceLabel(req));
    return this.deliver(req, res, result, 'admin');
  }
}
