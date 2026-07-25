import { getCookie, setCookie } from "hono/cookie";
import type { Context, MiddlewareHandler } from "hono";
import { EdgeCMSError } from "@kalayaan/core";
import { randomToken } from "./tokens.js";
import { secureCookies } from "./secure-cookie.js";

const COOKIE_NAME = "kalayaan_csrf";
const HEADER_NAME = "x-csrf-token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Issues (or refreshes) a readable, non-HttpOnly CSRF cookie the SPA echoes back as a header. */
export function issueCsrfCookie(c: Context): string {
  const existing = getCookie(c, COOKIE_NAME);
  const token = existing ?? randomToken(16);
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: false,
    secure: secureCookies(c),
    sameSite: "Lax",
    path: "/",
  });
  return token;
}

/**
 * Double-submit CSRF check for session-authenticated (cookie-based)
 * mutations. Bearer-token requests are exempt: a forged cross-site request
 * can't attach an Authorization header, so CSRF doesn't apply to them.
 */
export const csrfProtection: MiddlewareHandler = async (c, next) => {
  const isBearer = c.req.header("authorization")?.startsWith("Bearer ");
  if (SAFE_METHODS.has(c.req.method) || isBearer) return next();

  const cookieToken = getCookie(c, COOKIE_NAME);
  const headerToken = c.req.header(HEADER_NAME);
  if (!cookieToken || !headerToken || cookieToken !== headerToken)
    throw new EdgeCMSError("forbidden", "Missing or invalid CSRF token");
  return next();
};
