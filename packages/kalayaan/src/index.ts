// The umbrella package: `npm install kalayaan` pulls in config, runtime, and
// the CLI in one shot, so `npx kalayaan init` works from a single install.
//
// The generated Worker entry (see @kalayaan/cli's entry-template.ts) imports
// resolveConfig/snapshotOf/createApp from HERE, not from @kalayaan/config or
// @kalayaan/runtime directly — a project only ever declares "kalayaan" as a
// dependency, and package managers with strict, non-hoisted resolution
// (pnpm workspaces in particular) won't resolve a bare import of a
// transitive dependency that isn't re-exported through something the
// project actually depends on.
export { defineConfig, collection, field, resolveConfig, snapshotOf } from "@kalayaan/config";
export type * from "@kalayaan/config";
export { createApp } from "@kalayaan/runtime";
// Reference PaymentProvider impl a module's `provides.payment` factory
// constructs directly (unlike AI/Email, there's no Cloudflare-native payment
// binding to auto-wire) — see StripePaymentProvider's docstring.
export { StripePaymentProvider } from "@kalayaan/runtime";
// Runtime extension points: plugin lifecycle hooks and custom field types are
// registered via createApp's options — re-exported so a project depending only
// on "kalayaan" can author them.
export { PluginHost } from "@kalayaan/core";
export type {
  Plugin,
  // A Plugin plus build-time collections and provider factories (e.g. a
  // marketplace's tables + a PaymentProvider) — registered the same way, via
  // `cms.modules.ts`'s default export. See @kalayaan/core's plugin.ts.
  Module,
  HookContext,
  HookOperation,
  AIProvider,
  EmailProvider,
  EmailMessage,
  PaymentProvider,
  Money,
  CreatePaymentIntentInput,
  PaymentIntent,
  // Business-specific HTTP endpoints registered via `Plugin.routes` and
  // mounted at `/api/ext` — see @kalayaan/core's plugin.ts for the full
  // extension-seam design.
  RouteDef,
  RouteMethod,
  RouteContext,
  RouteActor,
  DataApi,
  CollectionApi,
  Action,
} from "@kalayaan/core";
