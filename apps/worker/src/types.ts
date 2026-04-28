export interface VerifyEmailJob {
  type: 'verify_email';
  to: string;
  firstName: string;
  /** Raw (un-hashed) token placed in the verification link */
  token: string;
  baseUrl: string;
}

export interface ResetPasswordJob {
  type: 'reset_password';
  to: string;
  firstName: string;
  /** Raw (un-hashed) token placed in the reset link */
  token: string;
  baseUrl: string;
}

// Extend with additional job types as new email workflows are added
export type EmailJob = VerifyEmailJob | ResetPasswordJob;
