import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { secureCookies } from "./secure-cookie.js";
import type { Context } from "hono";
import { hmacSign, hmacVerify, randomToken } from "./tokens.js";

const COOKIE_NAME = "kalayaan_session";
const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days, sliding

export interface SessionData {
  userId: string;
  createdAt: number;
}

/** Session id + HMAC signature, joined with a dot, as the cookie value. */
async function signedCookieValue(secret: string, sessionId: string): Promise<string> {
  return `${sessionId}.${await hmacSign(secret, sessionId)}`;
}

async function parseCookieValue(secret: string, value: string): Promise<string | null> {
  const dot = value.lastIndexOf(".");
  if (dot < 0) return null;
  const sessionId = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  return (await hmacVerify(secret, sessionId, signature)) ? sessionId : null;
}

export async function createSession(
  c: Context,
  kv: KVNamespace,
  secret: string,
  userId: string,
): Promise<void> {
  const sessionId = randomToken();
  const data: SessionData = { userId, createdAt: Date.now() };
  await kv.put(`sess:${sessionId}`, JSON.stringify(data), { expirationTtl: TTL_SECONDS });
  setCookie(c, COOKIE_NAME, await signedCookieValue(secret, sessionId), {
    httpOnly: true,
    secure: secureCookies(c),
    sameSite: "Lax",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

export async function readSession(
  c: Context,
  kv: KVNamespace,
  secret: string,
): Promise<SessionData | null> {
  const cookieValue = getCookie(c, COOKIE_NAME);
  if (!cookieValue) return null;
  const sessionId = await parseCookieValue(secret, cookieValue);
  if (!sessionId) return null;
  const raw = await kv.get(`sess:${sessionId}`);
  if (!raw) return null;
  // Sliding expiration: touch the TTL on every authenticated read.
  await kv.put(`sess:${sessionId}`, raw, { expirationTtl: TTL_SECONDS });
  return JSON.parse(raw) as SessionData;
}

export async function destroySession(c: Context, kv: KVNamespace, secret: string): Promise<void> {
  const cookieValue = getCookie(c, COOKIE_NAME);
  if (cookieValue) {
    const sessionId = await parseCookieValue(secret, cookieValue);
    if (sessionId) await kv.delete(`sess:${sessionId}`);
  }
  deleteCookie(c, COOKIE_NAME, { path: "/" });
}
