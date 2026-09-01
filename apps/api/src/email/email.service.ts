import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  private cfg(key: string, fallbackKey?: string): string | undefined {
    const v = this.config.get<string>(key);
    if (v) return v;
    if (fallbackKey) return this.config.get<string>(fallbackKey);
    return undefined;
  }

  private from(): string {
    const legacy = this.cfg('EMAIL_FROM');
    if (legacy) return legacy;

    const address = this.cfg('MAIL_FROM_ADDRESS');
    const name = this.cfg('MAIL_FROM_NAME') ?? 'Zegbot';
    if (address) {
      const cleanName = name.replace(/^["']|["']$/g, '');
      return `${cleanName} <${address.replace(/^["']|["']$/g, '')}>`;
    }

    return 'Zegbot <noreply@zegbot.local>';
  }

  async sendVerification(to: string, link: string, code?: string) {
    const codeBlock = code
      ? `<p>Your confirmation code is:</p><p style="font-size:28px;letter-spacing:6px;font-weight:700">${code}</p>`
      : '';
    const codeText = code ? ` Your code is ${code}.` : '';
    await this.send(
      to,
      'Confirm your Zegbot registration',
      `<p>Thanks for signing up for Zegbot.</p>${codeBlock}<p>Or confirm by opening this link:</p><p><a href="${link}">${link}</a></p><p>If you did not create this account, you can ignore this email.</p>`,
      `Thanks for signing up for Zegbot.${codeText} Confirm here: ${link}`,
    );
  }

  async sendPasswordReset(to: string, link: string) {
    await this.send(
      to,
      'Reset your Zegbot password',
      `<p>We received a request to reset your password.</p><p>Open this link (expires in 1 hour):</p><p><a href="${link}">${link}</a></p>`,
      `Reset your Zegbot password: ${link}`,
    );
  }

  private smtpHost(): string | undefined {
    return this.cfg('MAIL_HOST', 'SMTP_HOST');
  }

  private async send(to: string, subject: string, html: string, text: string) {
    const resendKey = this.config.get<string>('RESEND_API_KEY');
    const smtpHost = this.smtpHost();

    if (resendKey) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from(),
          to,
          subject,
          html,
          text,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        this.logger.error(`Resend failed: ${res.status} ${body}`);
        throw new Error('Could not send email');
      }
      return;
    }

    if (smtpHost) {
      const port = Number(this.cfg('MAIL_PORT', 'SMTP_PORT') ?? 587);
      const user = this.cfg('MAIL_USERNAME', 'SMTP_USER');
      const pass = this.cfg('MAIL_PASSWORD', 'SMTP_PASS');
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port,
        secure: port === 465,
        auth: user ? { user, pass } : undefined,
      });
      await transporter.sendMail({
        from: this.from(),
        to,
        subject,
        html,
        text,
      });
      this.logger.log(`Email sent to ${to}: ${subject}`);
      return;
    }

    this.logger.warn(`[email fallback] to=${to} subject="${subject}" ${text}`);
  }
}
