import { Hono, type Context, type MiddlewareHandler } from "hono";
import { EdgeCMSError, type AIProvider, type EmailProvider, type PaymentProvider, type PluginHost, type RouteActor, type RouteContext, type RouteDef } from "@kalayaan/core";
import type { ResolvedConfig } from "@kalayaan/config";
import { requireAuth, publicAuth, type AuthEnv } from "../auth/middleware.js";
import { csrfProtection } from "../auth/csrf.js";
import type { VectorizeBinding } from "../ai/search-index.js";
import type { ContentEnv } from "./content.js";
import type { MediaEnv } from "./media.js";
import { buildDataApi } from "../extensions/data-api.js";

type ExtEnv = ContentEnv &
  MediaEnv &
  AuthEnv & {
    Bindings: { VECTORIZE?: VectorizeBinding };
    Variables: { ai?: AIProvider; email?: EmailProvider; payment?: PaymentProvider };
  };

/**
 * Mounts every plugin-registered route (`Plugin.routes`) under `/api/ext`.
 * This is the business-logic extension seam: a plugin author gets its own
 * auth (public or required), an optional permission gate, and a
 * {@link RouteContext} that reaches every collection through the same
 * RBAC + lifecycle-hook pipeline the built-in CRUD API uses — so a custom
 * endpoint can touch e.g. `projects` and `timesheets` and `users` in one
 * request without bypassing permissions or duplicating write logic.
 */
export function extensionRoutes(config: ResolvedConfig, plugins: PluginHost) {
  const app = new Hono<ExtEnv>();

  for (const route of plugins.routes()) {
    registerRoute(app, config, plugins, route);
  }

  return app;
}

/** Runs a fixed chain of middlewares in order, then falls through to Hono's own `next()`. */
function compose(middlewares: MiddlewareHandler<ExtEnv>[]): MiddlewareHandler<ExtEnv> {
  return async (c, next) => {
    let index = -1;
    const run = async (i: number): Promise<void> => {
      if (i <= index) throw new Error("next() called multiple times");
      index = i;
      const mw = middlewares[i];
      if (!mw) return next();
      await mw(c, () => run(i + 1));
    };
    await run(0);
  };
}

function registerRoute(app: Hono<ExtEnv>, config: ResolvedConfig, plugins: PluginHost, route: RouteDef): void {
  // requireAuth/publicAuth are typed against the narrower AuthEnv; ExtEnv is a strict
  // superset of its Bindings/Variables, so this widening is sound.
  const authMw = (route.public ? publicAuth() : requireAuth()) as unknown as MiddlewareHandler<ExtEnv>;
  const middlewares: MiddlewareHandler<ExtEnv>[] = [authMw];
  // Session (cookie) requests still need CSRF on mutations; bearer/anonymous requests are exempt (see csrfProtection).
  if (!route.public) middlewares.push(csrfProtection);
  if (route.permission) {
    const { action, subject } = route.permission;
    middlewares.push(async (c, next) => {
      if (!c.var.actor.ability.can(action, subject))
        throw new EdgeCMSError(route.public ? "not_found" : "forbidden", `Not permitted to ${action} "${subject}"`);
      await next();
    });
  }
  const auth = compose(middlewares);

  const handler = async (c: Context<ExtEnv>) => {
    const actor = c.var.actor;
    const routeActor: RouteActor = { type: actor.type, id: actor.id, ability: actor.ability };
    const url = new URL(c.req.url);
    const query: Record<string, string> = {};
    for (const [key, value] of url.searchParams) query[key] = value;

    const ctx: RouteContext = {
      actor: routeActor,
      can: (action, subject) => actor.ability.can(action, subject),
      assert: (action, subject) => {
        if (!actor.ability.can(action, subject))
          throw new EdgeCMSError("forbidden", `Not permitted to ${action} "${subject}"`);
      },
      db: buildDataApi(c, config, plugins, routeActor),
      rawAdapter: c.var.adapter,
      ...(c.var.ai !== undefined && { ai: c.var.ai }),
      ...(c.var.email !== undefined && { email: c.var.email }),
      ...(c.var.payment !== undefined && { payment: c.var.payment }),
      storage: c.var.storage,
      req: c.req.raw,
      params: c.req.param(),
      query,
      json: <T>() => c.req.json() as Promise<T>,
    };

    const result = await route.handler(ctx);
    if (result instanceof Response) return result;
    return c.json((result ?? {}) as object);
  };

  switch (route.method) {
    case "GET":
      app.get(route.path, auth, handler);
      break;
    case "POST":
      app.post(route.path, auth, handler);
      break;
    case "PUT":
      app.put(route.path, auth, handler);
      break;
    case "PATCH":
      app.patch(route.path, auth, handler);
      break;
    case "DELETE":
      app.delete(route.path, auth, handler);
      break;
  }
}
