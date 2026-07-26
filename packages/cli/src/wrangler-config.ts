import type { ResolvedConfig } from "@kalayaan/config";
import type { ResourceIds } from "./state.js";

export interface WranglerConfig {
  name: string;
  main: string;
  compatibility_date: string;
  compatibility_flags?: string[];
  assets?: {
    directory: string;
    binding?: string;
    not_found_handling: "single-page-application";
    run_worker_first: string[];
  };
  d1_databases: { binding: "DB"; database_name: string; database_id: string }[];
  r2_buckets: { binding: "MEDIA"; bucket_name: string }[];
  kv_namespaces: { binding: "SESSIONS"; id: string }[];
  hyperdrive?: { binding: "HYPERDRIVE"; id: string }[];
  vectorize?: { binding: "VECTORIZE"; index_name: string }[];
  ai?: { binding: "AI" };
  send_email?: { name: "EMAIL" }[];
  vars: { SESSION_SECRET: string; DB_ADAPTER: string };
}

const COMPATIBILITY_DATE = "2025-01-01";

/**
 * The single URL namespace the runtime and the Assets binding split
 * between them: everything under these prefixes always reaches the
 * Worker first; everything else (the admin SPA) is served as a static
 * asset. See @kalayaan/runtime's app.ts for the matching route mounts.
 */
// `/mcp` is a bare endpoint (the JSON-RPC POST target), so it needs an exact
// match in addition to `/mcp/*` — a `/*` pattern alone does NOT cover the path
// without a trailing segment, and Assets would otherwise swallow POST /mcp.
// `/` is listed so the Worker's root route (the branded splash in runtime's
// root.ts) runs instead of the Assets binding serving the admin SPA's index.html
// at `/` — the SPA is scoped to `/admin`, so without this `/` renders blank.
// Only the exact root is claimed; `/admin` and every other non-API path still
// fall through to Assets.
export const RUN_WORKER_FIRST = ["/", "/api/*", "/admin/api/*", "/media/*", "/mcp", "/mcp/*"];

export interface WranglerConfigOptions {
  entryPath: string;
  assetsDir?: string;
  sessionSecret: string;
  resources: ResourceIds;
}

export function generateWranglerConfig(
  config: ResolvedConfig,
  opts: WranglerConfigOptions,
): WranglerConfig {
  const wrangler: WranglerConfig = {
    name: opts.resources.worker?.name ?? config.name,
    main: opts.entryPath,
    compatibility_date: COMPATIBILITY_DATE,
    d1_databases: [
      {
        binding: "DB",
        database_name: opts.resources.d1?.name ?? `${config.name}-db`,
        database_id: opts.resources.d1?.id ?? "local-dev",
      },
    ],
    r2_buckets: [{ binding: "MEDIA", bucket_name: opts.resources.r2?.name ?? `${config.name}-media` }],
    kv_namespaces: [{ binding: "SESSIONS", id: opts.resources.kv?.sessions ?? "local-dev" }],
    vars: { SESSION_SECRET: opts.sessionSecret, DB_ADAPTER: config.database.adapter },
  };
  // External databases (Postgres/MySQL) reach the Worker through a Hyperdrive
  // binding — pooled connection over the config's connection string.
  if (config.database.adapter === "postgres" || config.database.adapter === "mysql") {
    wrangler.hyperdrive = [{ binding: "HYPERDRIVE", id: opts.resources.hyperdrive?.id ?? "local-dev" }];
    // The Postgres/MySQL drivers need Node built-ins (streams, events, buffer).
    wrangler.compatibility_flags = ["nodejs_compat"];
  }
  // Semantic search stores embeddings in a Vectorize index.
  if (config.ai.enabled && config.ai.features.includes("semantic-search")) {
    wrangler.vectorize = [
      { binding: "VECTORIZE", index_name: opts.resources.vectorize?.name ?? `${config.name}-search` },
    ];
  }
  // Workers AI is account-level: no resource to provision, just a binding.
  if (config.ai.enabled) wrangler.ai = { binding: "AI" };
  // Cloudflare Email Sending: a binding only — the from-domain is onboarded
  // separately at deploy time via the Email Routing/Sending REST API (see
  // cf/email.ts), not `wrangler email sending enable`. Added when email is configured.
  if (config.email.from) wrangler.send_email = [{ name: "EMAIL" }];
  if (opts.assetsDir) {
    wrangler.assets = {
      directory: opts.assetsDir,
      not_found_handling: "single-page-application",
      run_worker_first: RUN_WORKER_FIRST,
    };
  }
  return wrangler;
}
