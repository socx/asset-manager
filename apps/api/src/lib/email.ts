import { Queue } from 'bullmq';
import { redis } from './redis';
import { logger } from './logger';

export interface VerifyEmailJob {
  type: 'verify_email';
  to: string;
  firstName: string;
  /** Raw (un-hashed) token that goes into the verification link */
  token: string;
  baseUrl: string;
}

// Additional job types for future stories (password reset, notifications, etc.) extend here
export type EmailJob = VerifyEmailJob;

let emailQueue: Queue<EmailJob> | null = null;

function getEmailQueue(): Queue<EmailJob> {
  if (!emailQueue) {
    emailQueue = new Queue<EmailJob>('email', { connection: redis });
  }
  return emailQueue;
}

/**
 * Enqueues an email job on the BullMQ 'email' queue.
 * Failures are logged but never propagate — email queueing must not abort a user-facing request.
 */
export async function queueEmail(job: EmailJob): Promise<void> {
  try {
    await getEmailQueue().add(job.type, job, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  } catch (err) {
    logger.error('[email] Failed to queue email job', { type: job.type, to: job.to, err });
  }
}
