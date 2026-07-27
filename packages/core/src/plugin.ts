import type { CollectionDef } from "@kalayaan/config";
import type { Doc, DocRef, Page, Query } from "./query.js";
import type { Action, Ability } from "./permissions.js";
import type { AIProvider } from "./ai.js";
import type { EmailProvider } from "./email.js";
import type { PaymentProvider } from "./payment.js";
import type { DatabaseAdapter, StorageAdapter } from "./adapter.js";

/**
 * The plugin lifecycle. Plugins carry functions, so unlike the serializable
 * config they're registered at runtime (passed to `createApp`). A plugin hooks
 * the document lifecycle to validate, enrich, or react to writes, contributes
 * custom field types the admin/validation layer understands, and can register
 * business-specific HTTP routes (see {@link RouteDef}).
 */
export type HookOperation = "create" | "update" | "delete";

export interface HookContext {
  collection: string;
  operation: HookOperation;
  /**
   * beforeChange: the incoming write data (mutable via the return value).
   * after* hooks: the persisted document (read-only).
   */
  data: Record<string, unknown>;
  actor: { type: string; id: string | null } | null;
}

/** The authenticated principal a route handler sees. Structurally matches @kalayaan/runtime's `Actor`. */
export interface RouteActor {
  type: string;
  id: string | null;
  ability: Ability;
}

/** Per-collection access a route handler uses to read/write documents outside its own collection. */
export interface CollectionApi {
  find(query: Omit<Query, "collection">): Promise<Page>;
  findOne(ref: Omit<DocRef, "collection">): Promise<Doc | null>;
  /** Runs the same beforeChange/afterChange(/afterPublish) pipeline as the admin CRUD API. */
  create(data: Record<string, unknown>): Promise<Doc>;
  update(id: string, patch: Record<string, unknown>): Promise<Doc>;
  delete(id: string): Promise<void>;
}

/**
 * RBAC- and lifecycle-hook-aware access to every collection, scoped to the
 * requesting actor's {@link Ability}. This is the seam that lets a custom
 * route touch collections beyond the one it "belongs" to (e.g. a
 * productivity-tracking route that reads `projects` and writes `timesheets`
 * and `users` atomically).
 */
export interface DataApi {
  /** Throws `not_found` for an unknown collection; RBAC is enforced per call, not here. */
  collection(name: string): CollectionApi;
  /** Runs writes inside a transaction (see {@link DatabaseAdapter.transaction}). */
  tx<T>(fn: (db: DataApi) => Promise<T>): Promise<T>;
}

export interface RouteContext {
  actor: RouteActor;
  can(action: Action, subject: string): boolean;
  /** Throws `forbidden` when the actor can't `action` on `subject`. */
  assert(action: Action, subject: string): void;
  /** RBAC- and hook-aware data access across all collections. */
  db: DataApi;
  /** Escape hatch: the raw adapter, bypassing RBAC and lifecycle hooks entirely. */
  rawAdapter: DatabaseAdapter;
  ai?: AIProvider;
  email?: EmailProvider;
  /** Set when a registered module's `provides.payment` factory produced a provider for this request. */
  payment?: PaymentProvider;
  storage: StorageAdapter;
  req: Request;
  /** Path params, e.g. `:id` in `/projects/:id/log-time`. */
  params: Record<string, string>;
  /** Query string params (last value wins for repeated keys). */
  query: Record<string, string>;
  json<T = unknown>(): Promise<T>;
}

export type RouteMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RouteDef {
  method: RouteMethod;
  /** Mounted under `/api/ext`, e.g. `/projects/:id/log-time` → `/api/ext/projects/:id/log-time`. */
  path: string;
  /** Allow anonymous requests. Defaults to requiring authentication. */
  public?: boolean;
  /** Checked before the handler runs; 403s (or 404s if `public`) when the actor lacks it. */
  permission?: { action: Action; subject: string };
  /** Return a `Response` for full control, or any JSON-serializable value. */
  handler: (ctx: RouteContext) => Response | unknown | Promise<Response | unknown>;
}

export interface Plugin {
  name: string;
  /**
   * Contribute custom field types. Each maps a type name to a validator that
   * runs in the write path; the value it returns is what gets stored.
   */
  fieldTypes?: Record<string, (value: unknown) => unknown>;
  hooks?: {
    /** Runs before a create/update; return the (possibly transformed) data. */
    beforeChange?: (ctx: HookContext) => Record<string, unknown> | Promise<Record<string, unknown>>;
    /** Runs after any successful create/update. */
    afterChange?: (ctx: HookContext) => void | Promise<void>;
    /** Runs after a write that leaves the document published. */
    afterPublish?: (ctx: HookContext) => void | Promise<void>;
    /** Runs after a successful delete. */
    afterDelete?: (ctx: HookContext) => void | Promise<void>;
  };
  /** Business-specific HTTP endpoints, mounted at `/api/ext/*` (see {@link RouteDef}). */
  routes?: RouteDef[];
  /**
   * Custom permission subjects this plugin's routes check (e.g.
   * `"marketplace:order"`), so `resolveConfig` accepts a role granting them
   * instead of rejecting an unrecognized subject. A subject not declared here
   * (or in `RouteDef.permission`) is still checkable at runtime — `Ability` is
   * subject-agnostic — but a role config naming it fails config validation
   * until it's declared. Note a role's `subjects: "*"` grant already matches
   * these like it matches collections (only the fixed system areas — media,
   * webhooks, users, api_keys, settings, ai — are excluded from `"*"`); scope
   * a sensitive custom subject with an explicit grant if it shouldn't ride
   * along with a broad `"*"` permission.
   */
  subjects?: string[];
}

/**
 * The superset of a `Plugin`: everything a business-logic extension needs to
 * be self-contained, split along the config/runtime seam this repo already
 * has. `collections` is *build-time data* — the CLI merges it into the
 * project's config before `resolveConfig`/`snapshotOf` run, so `kalayaan
 * migrate` creates the tables like any collection declared in
 * `cms.config.ts`. Everything else (`routes`/`hooks`/`fieldTypes`/`subjects`,
 * inherited from `Plugin`) is runtime, registered the same way a plain
 * `Plugin` is. A module is installed by adding it to a project's
 * `cms.modules.ts` default export.
 */
export interface Module extends Plugin {
  /** Merged into the project's `collections` before config resolution. */
  collections?: CollectionDef[];
  /**
   * Capability providers this module supplies to every registered route via
   * `RouteContext`. A factory, not a constructed instance: a Worker only
   * exposes bindings/secrets through the per-request `env` object, never at
   * import time, so the provider has to be built lazily from the live
   * bindings on each request — e.g.
   * `provides: { payment: (env) => new StripePaymentProvider(env.STRIPE_SECRET_KEY) }`.
   */
  provides?: {
    payment?: (env: Record<string, unknown>) => PaymentProvider;
  };
}

/**
 * Runs registered plugins (and modules — a `Module` is a `Plugin` plus
 * build-time collections and provider factories) in order. `beforeChange`
 * threads the data through each plugin (later plugins see earlier
 * transforms); the after-hooks are side-effecting and awaited so failures
 * surface to the caller, which decides whether to run them inline or
 * fire-and-forget.
 */
export class PluginHost {
  constructor(private readonly plugins: (Plugin | Module)[] = []) {}

  get all(): readonly Plugin[] {
    return this.plugins;
  }

  /** Merge of every plugin's custom field-type validators. */
  fieldTypes(): Record<string, (value: unknown) => unknown> {
    const out: Record<string, (value: unknown) => unknown> = {};
    for (const p of this.plugins) Object.assign(out, p.fieldTypes ?? {});
    return out;
  }

  /**
   * Every custom permission subject declared across plugins — explicitly via
   * `Plugin.subjects`, and implicitly by any `RouteDef.permission.subject` a
   * plugin's routes reference. Deduplicated; order is registration order.
   */
  subjects(): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const add = (subject: string) => {
      if (!seen.has(subject)) {
        seen.add(subject);
        out.push(subject);
      }
    };
    for (const p of this.plugins) {
      for (const subject of p.subjects ?? []) add(subject);
      for (const route of p.routes ?? []) if (route.permission) add(route.permission.subject);
    }
    return out;
  }

  /** Every plugin's routes, in registration order. Duplicate method+path across plugins is a config error. */
  routes(): RouteDef[] {
    const out: RouteDef[] = [];
    const seen = new Set<string>();
    for (const p of this.plugins) {
      for (const route of p.routes ?? []) {
        const key = `${route.method} ${route.path}`;
        if (seen.has(key)) throw new Error(`Duplicate plugin route: ${key} (registered by more than one plugin)`);
        seen.add(key);
        out.push(route);
      }
    }
    return out;
  }

  /**
   * Builds the payment provider from the first registered module whose
   * `provides.payment` factory is set, or `undefined` if none is. Later
   * modules' factories are ignored — declaring more than one payment
   * provider is a config error the caller should surface, not silently
   * pick a winner from; keep it to at most one module per project for now.
   */
  payment(env: Record<string, unknown>): PaymentProvider | undefined {
    for (const p of this.plugins) {
      const factory = (p as Module).provides?.payment;
      if (factory) return factory(env);
    }
    return undefined;
  }

  async beforeChange(ctx: HookContext): Promise<Record<string, unknown>> {
    let data = ctx.data;
    for (const p of this.plugins) {
      if (p.hooks?.beforeChange) data = await p.hooks.beforeChange({ ...ctx, data });
    }
    return data;
  }

  async afterChange(ctx: HookContext): Promise<void> {
    for (const p of this.plugins) await p.hooks?.afterChange?.(ctx);
  }

  async afterPublish(ctx: HookContext): Promise<void> {
    for (const p of this.plugins) await p.hooks?.afterPublish?.(ctx);
  }

  async afterDelete(ctx: HookContext): Promise<void> {
    for (const p of this.plugins) await p.hooks?.afterDelete?.(ctx);
  }
}
