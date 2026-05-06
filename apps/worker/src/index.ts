import { Worker } from 'bullmq';
import Redis from 'ioredis';
import nodemailer from 'nodemailer';
import type { EmailJob } from './types';

const env = {
  REDIS_URL: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
  SMTP_HOST: process.env['SMTP_HOST'] ?? 'localhost',
  SMTP_PORT: Number(process.env['SMTP_PORT'] ?? '1025'),
  SMTP_SECURE: process.env['SMTP_SECURE'] === 'true',
  SMTP_USER: process.env['SMTP_USER'],
  SMTP_PASS: process.env['SMTP_PASS'],
  EMAIL_FROM: process.env['EMAIL_FROM'] ?? 'noreply@assetmanager.local',
};

const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

// Worker heartbeat: refresh a Redis key so the API can detect the worker is running
const WORKER_HEARTBEAT_KEY = 'worker:heartbeat';
const WORKER_HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds
const WORKER_HEARTBEAT_EX_SECONDS = 90; // expire after 90 seconds
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
async function refreshHeartbeat() {
  try {
    await connection.set(WORKER_HEARTBEAT_KEY, String(Date.now()), 'EX', WORKER_HEARTBEAT_EX_SECONDS);
  } catch (err: any) {
    console.error('[worker] Failed to set heartbeat:', err?.message ?? err);
  }
}

// Start heartbeat loop
refreshHeartbeat().catch(() => {});
heartbeatTimer = setInterval(() => void refreshHeartbeat(), WORKER_HEARTBEAT_INTERVAL_MS);

// Ensure the heartbeat timer does not keep the Node.js event loop alive
if (heartbeatTimer && typeof (heartbeatTimer as any).unref === 'function') {
  (heartbeatTimer as any).unref();
}

const transport = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
});

function verifyEmailHtml(firstName: string, verifyLink: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f4f4f5; margin: 0; padding: 32px 16px; }
    .card { max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 40px 36px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    .logo { font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 28px; letter-spacing: -0.3px; }
    h1 { font-size: 22px; font-weight: 600; color: #0f172a; margin: 0 0 16px; }
    p { color: #475569; line-height: 1.65; margin: 0 0 16px; font-size: 15px; }
    .btn { display: inline-block; background: #0ea5e9; color: #ffffff !important; text-decoration: none; padding: 13px 28px; border-radius: 6px; font-size: 15px; font-weight: 600; }
    .link-fallback { word-break: break-all; font-size: 12px; color: #64748b; }
    .footer { margin-top: 32px; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 20px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">&#x25A3; Asset Manager</div>
    <h1>Verify your email address</h1>
    <p>Hi ${firstName},</p>
    <p>Thanks for registering. Click the button below to verify your email and activate your account. This link expires in <strong>24 hours</strong>.</p>
    <p><a class="btn" href="${verifyLink}">Verify Email Address</a></p>
    <p style="margin-top:24px; font-size:13px; color:#64748b;">Or copy this link into your browser:</p>
    <p class="link-fallback">${verifyLink}</p>
    <div class="footer">
      If you didn't create an Asset Manager account, you can safely ignore this email.
    </div>
  </div>
</body>
</html>`;
}

function resetPasswordHtml(firstName: string, resetLink: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f4f4f5; margin: 0; padding: 32px 16px; }
    .card { max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 40px 36px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    .logo { font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 28px; letter-spacing: -0.3px; }
    h1 { font-size: 22px; font-weight: 600; color: #0f172a; margin: 0 0 16px; }
    p { color: #475569; line-height: 1.65; margin: 0 0 16px; font-size: 15px; }
    .btn { display: inline-block; background: #0ea5e9; color: #ffffff !important; text-decoration: none; padding: 13px 28px; border-radius: 6px; font-size: 15px; font-weight: 600; }
    .link-fallback { word-break: break-all; font-size: 12px; color: #64748b; }
    .footer { margin-top: 32px; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 20px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">&#x25A3; Asset Manager</div>
    <h1>Reset your password</h1>
    <p>Hi ${firstName},</p>
    <p>We received a request to reset your Asset Manager password. Click the button below to choose a new password. This link expires in <strong>1 hour</strong>.</p>
    <p><a class="btn" href="${resetLink}">Reset Password</a></p>
    <p style="margin-top:24px; font-size:13px; color:#64748b;">Or copy this link into your browser:</p>
    <p class="link-fallback">${resetLink}</p>
    <div class="footer">
      If you didn't request a password reset, you can safely ignore this email. Your password has not been changed.
    </div>
  </div>
</body>
</html>`;
}

// Email job worker — processes verification emails, password resets, notifications
const emailWorker = new Worker<EmailJob>(
  'email',
  async (job) => {
    console.log(`[worker] Processing email job "${job.name}" (id: ${job.id})`);

    if (job.name === 'verify_email') {
      const { to, firstName, token, baseUrl } = job.data;
      const verifyLink = `${baseUrl}/verify-email?token=${token}`;

      await transport.sendMail({
        from: env.EMAIL_FROM,
        to,
        subject: 'Verify your Asset Manager email address',
        html: verifyEmailHtml(firstName, verifyLink),
      });

      console.log(`[worker] Verification email sent to ${to}`);
    }

    if (job.name === 'reset_password') {
      const { to, firstName, token, baseUrl } = job.data;
      const resetLink = `${baseUrl}/reset-password?token=${token}`;

      await transport.sendMail({
        from: env.EMAIL_FROM,
        to,
        subject: 'Reset your Asset Manager password',
        html: resetPasswordHtml(firstName, resetLink),
      });

      console.log(`[worker] Password reset email sent to ${to}`);
    }
  },
  { connection },
);

emailWorker.on('completed', (job) => {
  console.log(`[worker] Email job ${job.id} completed`);
});

emailWorker.on('failed', (job, err) => {
  console.error(`[worker] Email job ${job?.id} failed:`, err.message);
});

console.log('[worker] Started — listening for jobs on Redis queue "email"');

const shutdown = async (signal: string) => {
  console.log(`[worker] ${signal} received — shutting down gracefully`);
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  // best-effort: remove heartbeat key so API shows offline immediately
  try {
    await connection.del(WORKER_HEARTBEAT_KEY);
  } catch {}

  // Close email worker and Redis connection before exiting
  try {
    await emailWorker.close();
  } catch (err) {
    console.error('[worker] Failed to close email worker:', (err as any)?.message ?? err);
  }

  try {
    await connection.quit();
  } catch (err) {
    console.error('[worker] Failed to quit Redis connection:', (err as any)?.message ?? err);
  }

  process.exit(0);
};

process.on('SIGTERM', (sig) => void shutdown('SIGTERM'));
process.on('SIGINT', (sig) => void shutdown('SIGINT'));
