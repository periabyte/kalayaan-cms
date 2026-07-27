import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prepareProject } from "../src/project.js";
import { loadConfig } from "../src/config-loader.js";
import { runMigrate } from "../src/commands/migrate.js";
import { readState } from "../src/state.js";

let dir: string;

const CONFIG_TS = `
import { defineConfig, collection, field } from "kalayaan";

export default defineConfig({
  name: "e2e-blog",
  collections: [
    collection("posts", {
      fields: {
        title: field.text({ required: true }),
        slug: field.slug({ from: "title", unique: true }),
      },
    }),
  ],
});
`;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "kalayaan-e2e-"));
  const { writeFile, mkdir, symlink } = await import("node:fs/promises");
  await writeFile(join(dir, "cms.config.ts"), CONFIG_TS);
  // The config imports from the "kalayaan" umbrella package; give the temp
  // project a node_modules that resolves it to our workspace build, the
  // same way a real install would.
  await mkdir(join(dir, "node_modules"), { recursive: true });
  const target = join(import.meta.dirname, "../../kalayaan");
  await symlink(target, join(dir, "node_modules", "kalayaan"), "dir").catch(() => undefined);
}, 20_000);

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("CLI project pipeline (real files, no process spawn)", () => {
  it("prepareProject writes a generated config module, worker entry, and wrangler.json", async () => {
    const prepared = await prepareProject(dir);
    expect(prepared.loaded.resolved.name).toBe("e2e-blog");
    expect(existsSync(join(dir, ".kalayaan", "config.generated.mjs"))).toBe(true);
    expect(existsSync(prepared.entryPath)).toBe(true);
    expect(existsSync(prepared.wranglerConfigPath)).toBe(true);

    const generated = await readFile(join(dir, ".kalayaan", "config.generated.mjs"), "utf-8");
    expect(generated).toContain('"name": "e2e-blog"');

    expect(prepared.wranglerConfig).toMatchObject({
      name: "e2e-blog",
      d1_databases: [{ binding: "DB", database_name: "e2e-blog-db" }],
    });
  });

  it("is idempotent — running it twice doesn't error and produces the same wrangler.json shape", async () => {
    const first = await prepareProject(dir);
    const second = await prepareProject(dir);
    expect(second.wranglerConfig).toEqual(first.wranglerConfig);
  });

  it("accepts a role granting a plugin-declared custom subject (business-module RBAC)", async () => {
    await writeFile(
      join(dir, "cms.plugins.ts"),
      `
import type { Plugin } from "kalayaan";
const plugins: Plugin[] = [{ name: "marketplace", subjects: ["marketplace:order"] }];
export default plugins;
`,
    );
    await writeFile(
      join(dir, "cms.config.ts"),
      `
import { defineConfig, collection, field } from "kalayaan";

export default defineConfig({
  name: "e2e-blog",
  roles: {
    manager: { permissions: [{ subjects: ["marketplace:order"], actions: ["read", "create"] }] },
  },
  collections: [
    collection("posts", {
      fields: { title: field.text({ required: true }), slug: field.slug({ from: "title", unique: true }) },
    }),
  ],
});
`,
    );

    const loaded = await loadConfig(dir);
    expect(loaded.resolved.roles.manager?.permissions).toContainEqual({
      subjects: ["marketplace:order"],
      actions: ["read", "create"],
    });
  });

  it("rejects a role granting an unrecognized subject when no plugin declares it", async () => {
    await writeFile(
      join(dir, "cms.config.ts"),
      `
import { defineConfig, collection, field } from "kalayaan";

export default defineConfig({
  name: "e2e-blog",
  roles: {
    manager: { permissions: [{ subjects: ["marketplace:order"], actions: ["read"] }] },
  },
  collections: [
    collection("posts", {
      fields: { title: field.text({ required: true }), slug: field.slug({ from: "title", unique: true }) },
    }),
  ],
});
`,
    );

    await expect(loadConfig(dir)).rejects.toThrow(/marketplace:order/);
  });

  it("merges a module's collections into the resolved config and threads its routes into the generated entry", async () => {
    await writeFile(
      join(dir, "cms.modules.ts"),
      `
import type { Module } from "kalayaan";
const modules: Module[] = [{
  name: "marketplace",
  collections: [{ name: "orders", fields: { total: { type: "number", required: true } } }],
  routes: [{ method: "POST", path: "/orders", handler: () => ({}) }],
}];
export default modules;
`,
    );

    const loaded = await loadConfig(dir);
    expect(loaded.resolved.collections.map((c) => c.name).sort()).toEqual(["orders", "posts"]);

    const prepared = await prepareProject(dir);
    expect(existsSync(join(dir, ".kalayaan", "modules.generated.mjs"))).toBe(true);
    const entry = await readFile(prepared.entryPath, "utf-8");
    expect(entry).toContain('import modules from "./modules.generated.mjs"');
    expect(entry).toContain("createApp(resolved, snapshot, { modules })");

    // The merged collection is pure data in the generated config module too —
    // migrate/doctor/deploy all read collections from there, not cms.modules.ts.
    const generatedConfig = await readFile(join(dir, ".kalayaan", "config.generated.mjs"), "utf-8");
    expect(generatedConfig).toContain('"name": "orders"');
  });
});

describe("kalayaan migrate (spawns real wrangler d1 execute --local)", () => {
  it("dry-run prints the plan without touching state or the local database", async () => {
    const result = await runMigrate({ projectDir: dir, dryRun: true });
    expect(result.changed).toBe(true);
    expect(result.applied).toBe(false);
    expect(result.sql).toContain('CREATE TABLE "posts"');

    const state = await readState(dir);
    expect(state.schema).toBeNull();
    expect(state.migrations).toEqual([]);
  });

  it("applies the migration to local D1 and records it in state.json", async () => {
    const result = await runMigrate({ projectDir: dir });
    expect(result.applied).toBe(true);
    expect(result.destructive).toBe(false);

    const state = await readState(dir);
    expect(state.migrations).toHaveLength(1);
    expect(state.schema?.collections.map((c) => c.name)).toEqual(["posts"]);

    // Re-running with no config changes is a no-op.
    const again = await runMigrate({ projectDir: dir });
    expect(again.changed).toBe(false);
  }, 30_000);

  it("refuses a destructive change without --allow-destructive", async () => {
    await runMigrate({ projectDir: dir });

    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      join(dir, "cms.config.ts"),
      `
import { defineConfig, collection, field } from "kalayaan";
export default defineConfig({
  name: "e2e-blog",
  collections: [collection("posts", { fields: { title: field.text({ required: true }) } })],
});
`,
    ); // dropped the "slug" field

    // Dry-run previews a destructive plan without needing --allow-destructive.
    const dryRun = await runMigrate({ projectDir: dir, dryRun: true });
    expect(dryRun.destructive).toBe(true);
    expect(dryRun.applied).toBe(false);

    // Actually applying it is blocked until --allow-destructive is passed.
    await expect(runMigrate({ projectDir: dir })).rejects.toThrow(/destructive/i);

    const applied = await runMigrate({ projectDir: dir, allowDestructive: true });
    expect(applied.applied).toBe(true);
  }, 45_000);
}, 60_000);
