// The extension's only network code (spec 7.7): our Supabase project's auth and REST endpoints, nothing else.
// The session lives in chrome.storage.session, which content scripts can't read and which is cleared when the
// browser closes. It never touches a portal password: it holds a UniGuide session only.
import { SUPABASE_KEY, SUPABASE_URL } from "./config";

export interface Session {
  access_token: string;
  refresh_token: string;
  /** Seconds since the epoch. */
  expires_at: number;
  user: { id: string; email: string | null };
}

export class SignedOut extends Error {
  constructor() {
    super("signed out");
  }
}

const STORE_KEY = "uniguide.session";
let cached: Session | null | undefined;
let refreshing: Promise<Session | null> | null = null;

export async function getSession(): Promise<Session | null> {
  if (cached !== undefined) return cached;
  const got = await chrome.storage.session.get(STORE_KEY);
  cached = (got[STORE_KEY] as Session | undefined) ?? null;
  return cached;
}

async function save(s: Session | null): Promise<void> {
  cached = s;
  if (s) await chrome.storage.session.set({ [STORE_KEY]: s });
  else await chrome.storage.session.clear();
}

function expiryOf(accessToken: string): number {
  try {
    const payload = JSON.parse(atob(accessToken.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp : 0;
  } catch {
    return 0;
  }
}

const authHeaders = (token?: string): Record<string, string> => ({
  apikey: SUPABASE_KEY,
  "content-type": "application/json",
  ...(token ? { authorization: `Bearer ${token}` } : {}),
});

/** Keep a session handed over by our sign-in page, after checking it with Supabase. */
export async function acceptSession(tokens: { access_token: string; refresh_token: string }): Promise<Session> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: authHeaders(tokens.access_token) });
  if (!res.ok) throw new Error("the session wasn't accepted");
  const user = (await res.json()) as { id: string; email?: string | null };
  const session: Session = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: expiryOf(tokens.access_token),
    user: { id: user.id, email: user.email ?? null },
  };
  await save(session);
  return session;
}

async function refresh(s: Session): Promise<Session | null> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ refresh_token: s.refresh_token }),
  });
  if (!res.ok) {
    await save(null);
    return null;
  }
  const t = (await res.json()) as { access_token: string; refresh_token: string; expires_at?: number };
  const next: Session = { ...s, access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at ?? expiryOf(t.access_token) };
  await save(next);
  return next;
}

/** A session good for at least another minute, refreshed once at a time. */
async function current(): Promise<Session | null> {
  const s = await getSession();
  if (!s) return null;
  if (s.expires_at - 60 > Date.now() / 1000) return s;
  refreshing ??= refresh(s).finally(() => (refreshing = null));
  return refreshing;
}

/** A request to our REST API as the signed-in student. Row-level security decides what comes back. */
export async function rest<T>(path: string, body?: unknown): Promise<T> {
  const s = await current();
  if (!s) throw new SignedOut();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...authHeaders(s.access_token), accept: "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (res.status === 401) {
    await save(null);
    throw new SignedOut();
  }
  if (!res.ok) throw new Error(`request failed (${res.status})`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export const rpc = <T>(fn: string, args: Record<string, unknown>) => rest<T>(`rpc/${fn}`, args);

/** Call one of our Edge Functions as the signed-in student. Returns the status, so callers can tell a limit from a failure. */
export async function invoke<T>(fn: string, body: unknown): Promise<{ status: number; data: T | null }> {
  const s = await current();
  if (!s) throw new SignedOut();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: { ...authHeaders(s.access_token), accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    await save(null);
    throw new SignedOut();
  }
  const text = await res.text().catch(() => "");
  let data: T | null = null;
  try {
    data = text ? (JSON.parse(text) as T) : null;
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

/** Forget everything, and end the session at Supabase too. */
export async function signOut(): Promise<void> {
  const s = await getSession();
  await save(null);
  if (s) await fetch(`${SUPABASE_URL}/auth/v1/logout`, { method: "POST", headers: authHeaders(s.access_token) }).catch(() => {});
}
