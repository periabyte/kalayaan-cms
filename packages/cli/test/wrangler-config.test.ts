import { describe, expect, it } from "vitest";
import { defineConfig, resolveConfig } from "@kalayaan/config";
import { generateWranglerConfig } from "../src/wrangler-config.js";

const config = resolveConfig(defineConfig({ name: "my-site", collections: [] }));

describe("generateWranglerConfig", () => {
  it("routes the root path plus the API/media prefixes to the Worker, leaving everything else to Assets", () => {
    const wrangler = generateWranglerConfig(config, {
      entryPath: "./worker-entry.mjs",
      assetsDir: "./admin-dist",
      sessionSecret: "s",
      resources: {},
    });
    // `/` must be first-class so the Worker's branded root page renders instead
    // of the Assets binding serving the (blank-at-`/`) admin SPA index.html.
    expect(wrangler.assets?.run_worker_first).toEqual(["/", "/api/*", "/admin/api/*", "/media/*", "/mcp", "/mcp/*"]);
    expect(wrangler.assets?.not_found_handling).toBe("single-page-application");
  });

  it("omits the assets block when no assetsDir is given (dev, before the SPA is built)", () => {
    const wrangler = generateWranglerConfig(config, {
      entryPath: "./worker-entry.mjs",
      sessionSecret: "s",
      resources: {},
    });
    expect(wrangler.assets).toBeUndefined();
  });

  it("defaults resource names from the config name when no state exists yet", () => {
    const wrangler = generateWranglerConfig(config, {
      entryPath: "./worker-entry.mjs",
      sessionSecret: "s",
      resources: {},
    });
    expect(wrangler.d1_databases[0]).toMatchObject({ database_name: "my-site-db", database_id: "local-dev" });
    expect(wrangler.r2_buckets[0]).toMatchObject({ bucket_name: "my-site-media" });
    expect(wrangler.name).toBe("my-site");
  });

  it("prefers real resource IDs from state over generated defaults", () => {
    const wrangler = generateWranglerConfig(config, {
      entryPath: "./worker-entry.mjs",
      sessionSecret: "s",
      resources: {
        d1: { id: "real-d1-id", name: "real-db" },
        r2: { name: "real-bucket" },
        kv: { cache: "kv1", sessions: "kv2" },
        worker: { name: "real-worker-name" },
      },
    });
    expect(wrangler.d1_databases[0]).toEqual({
      binding: "DB",
      database_name: "real-db",
      database_id: "real-d1-id",
    });
    expect(wrangler.kv_namespaces[0]).toEqual({ binding: "SESSIONS", id: "kv2" });
    expect(wrangler.name).toBe("real-worker-name");
  });

  it("always includes the DB, MEDIA, and SESSIONS bindings the runtime depends on", () => {
    const wrangler = generateWranglerConfig(config, {
      entryPath: "./worker-entry.mjs",
      sessionSecret: "s",
      resources: {},
    });
    expect(wrangler.d1_databases[0]!.binding).toBe("DB");
    expect(wrangler.r2_buckets[0]!.binding).toBe("MEDIA");
    expect(wrangler.kv_namespaces[0]!.binding).toBe("SESSIONS");
  });

  it("emits a HYPERDRIVE binding for external databases and sets DB_ADAPTER", () => {
    const pgConfig = resolveConfig(
      defineConfig({ name: "my-site", database: { adapter: "postgres" }, collections: [] }),
    );
    const wrangler = generateWranglerConfig(pgConfig, {
      entryPath: "./e.mjs",
      sessionSecret: "s",
      resources: { hyperdrive: { id: "hd-42" } },
    });
    expect(wrangler.hyperdrive).toEqual([{ binding: "HYPERDRIVE", id: "hd-42" }]);
    expect(wrangler.vars.DB_ADAPTER).toBe("postgres");
  });

  it("has no HYPERDRIVE binding for the default D1 database", () => {
    const wrangler = generateWranglerConfig(config, { entryPath: "./e.mjs", sessionSecret: "s", resources: {} });
    expect(wrangler.hyperdrive).toBeUndefined();
    expect(wrangler.vars.DB_ADAPTER).toBe("d1");
  });

  it("emits a VECTORIZE binding only when semantic-search is enabled", () => {
    const searchConfig = resolveConfig(
      defineConfig({
        name: "my-site",
        ai: { enabled: true, features: ["semantic-search"] },
        collections: [],
      }),
    );
    const wrangler = generateWranglerConfig(searchConfig, {
      entryPath: "./e.mjs",
      sessionSecret: "s",
      resources: {},
    });
    expect(wrangler.vectorize).toEqual([{ binding: "VECTORIZE", index_name: "my-site-search" }]);
  });

  it("emits the AI binding only when config.ai.enabled", () => {
    expect(generateWranglerConfig(config, { entryPath: "./e.mjs", sessionSecret: "s", resources: {} }).ai).toBeUndefined();

    const aiConfig = resolveConfig(
      defineConfig({ name: "my-site", ai: { enabled: true, features: ["alt-text"] }, collections: [] }),
    );
    const wrangler = generateWranglerConfig(aiConfig, { entryPath: "./e.mjs", sessionSecret: "s", resources: {} });
    expect(wrangler.ai).toEqual({ binding: "AI" });
  });
});
