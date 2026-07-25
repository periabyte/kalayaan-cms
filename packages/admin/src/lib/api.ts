export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : null;
}

const SAFE_METHODS = new Set(["GET", "HEAD", undefined]);

/**
 * Thin fetch wrapper: same-origin credentials, JSON in/out, the CSRF
 * double-submit header on mutations, and EdgeCMSError unwrapped into
 * ApiError so callers can branch on `.code`.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (!SAFE_METHODS.has(init.method?.toUpperCase())) {
    const csrfToken = readCookie("kalayaan_csrf");
    if (csrfToken) headers.set("x-csrf-token", csrfToken);
  }

  const res = await fetch(path, { ...init, headers, credentials: "same-origin" });

  if (res.status === 204) return undefined as T;

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json() : undefined;

  if (!res.ok) {
    const error = (body as { error?: { code: string; message: string; details?: unknown } })?.error;
    throw new ApiError(
      error?.code ?? "internal",
      error?.message ?? res.statusText,
      res.status,
      error?.details as { path: string; message: string }[] | undefined,
    );
  }

  return body as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "POST", ...(body !== undefined && { body: JSON.stringify(body) }) }),
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
  put: <T>(path: string, body: BodyInit, headers: Record<string, string>) =>
    apiFetch<T>(path, { method: "PUT", body, headers }),
};
