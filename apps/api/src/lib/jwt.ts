import jwt from 'jsonwebtoken';
import { env } from '../env';

export interface AccessTokenPayload {
  sub: string;   // user id
  role: string;
  email: string;
  iat?: number;
  exp?: number;
}

/**
 * Signs a short-lived access token (JWT).
 * Payload is intentionally minimal — no sensitive data.
 */
export function signAccessToken(payload: Omit<AccessTokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRY as jwt.SignOptions['expiresIn'],
  });
}

/**
 * Verifies and decodes an access token.
 * Throws if the token is invalid or expired.
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

// ── Refresh token cookie config ───────────────────────────────────────────────

export const REFRESH_COOKIE_NAME = 'refresh_token';

export const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  // Max-age in ms — parse the expiry string (e.g. "7d") into seconds for the cookie
  maxAge: parseExpiryToMs(env.JWT_REFRESH_EXPIRY),
  path: '/api/v1/auth',
} as const;

/** Parse a simple duration string like "7d", "24h" or "60m" into milliseconds. */
function parseExpiryToMs(expiry: string): number {
  const unit = expiry.slice(-1);
  const value = parseInt(expiry.slice(0, -1), 10);
  const msPerUnit: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return (msPerUnit[unit] ?? 86_400_000) * value;
}

export function refreshExpiryDate(): Date {
  return new Date(Date.now() + parseExpiryToMs(env.JWT_REFRESH_EXPIRY));
}
