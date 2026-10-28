import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';

export const SESSION_COOKIE = 'simmery_session';
export const STATE_COOKIE = 'simmery_auth';

const SESSION_MAX_AGE = 30 * 24 * 60 * 60;
const STATE_MAX_AGE = 10 * 60;

export interface CookieOptions {
  /** False only for a `http://localhost` base URL, so local development works over HTTP. */
  secure: boolean;
}

const base = ({ secure }: CookieOptions) =>
  ({ httpOnly: true, secure, sameSite: 'Lax', path: '/' }) as const;

export function readSession(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE);
}

export function writeSession(c: Context, sealedSession: string, options: CookieOptions): void {
  setCookie(c, SESSION_COOKIE, sealedSession, { ...base(options), maxAge: SESSION_MAX_AGE });
}

export function clearSession(c: Context, options: CookieOptions): void {
  deleteCookie(c, SESSION_COOKIE, base(options));
}

export interface LoginState {
  state: string;
  returnTo: string;
}

export function writeLoginState(c: Context, login: LoginState, options: CookieOptions): void {
  setCookie(c, STATE_COOKIE, JSON.stringify(login), { ...base(options), maxAge: STATE_MAX_AGE });
}

export function takeLoginState(c: Context, options: CookieOptions): LoginState | undefined {
  const raw = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, base(options));
  if (!raw) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<LoginState>;
    return typeof parsed.state === 'string' && typeof parsed.returnTo === 'string'
      ? { state: parsed.state, returnTo: parsed.returnTo }
      : undefined;
  } catch {
    return undefined;
  }
}
