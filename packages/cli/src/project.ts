import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { bundleModulesModule, bundlePluginsModule, loadConfig, writeGeneratedConfigModule, type LoadedConfig } from "./config-loader.js";
import { generateEntrySource } from "./entry-template.js";
import { generateWranglerConfig, type WranglerConfig } from "./wrangler-config.js";
import { readState } from "./state.js";

export interface PreparedProject {
  loaded: LoadedConfig;
  entryPath: string;
  wranglerConfig: WranglerConfig;
  wranglerConfigPath: string;
}

/**
 * Loads and validates the project's config, then (re)generates the two
 * build artifacts every command needs: the Worker entry module and
 * wrangler.json. Idempotent — safe to call at the start of `dev`, `migrate`,
 * and `deploy`.
 */
export async function prepareProject(
  projectDir: string,
  opts: { assetsDir?: string } = {},
): Promise<PreparedProject> {
  const loaded = await loadConfig(projectDir);
  const configModulePath = await writeGeneratedConfigModule(projectDir, loaded.raw);
  // Optional project plugins (lifecycle hooks + custom field types) and
  // modules (plugins plus collections, merged into loaded.raw above, and
  // provider factories like a PaymentProvider).
  const pluginsModulePath = await bundlePluginsModule(projectDir);
  const modulesModulePath = await bundleModulesModule(projectDir);

  const entryPath = join(projectDir, ".kalayaan", "worker-entry.mjs");
  await mkdir(join(projectDir, ".kalayaan"), { recursive: true });
  await writeFile(
    entryPath,
    generateEntrySource(
      "./config.generated.mjs",
      loaded.resolved.database.adapter,
      pluginsModulePath ? "./plugins.generated.mjs" : undefined,
      modulesModulePath ? "./modules.generated.mjs" : undefined,
    ),
  );
  void configModulePath; // co-located with entryPath; referenced by relative path above

  const state = await readState(projectDir);
  const sessionSecret = await devSessionSecret(projectDir);
  const wranglerConfig = generateWranglerConfig(loaded.resolved, {
    entryPath: "./worker-entry.mjs",
    sessionSecret,
    resources: state.resources,
    ...(opts.assetsDir && { assetsDir: opts.assetsDir }),
  });

  const wranglerConfigPath = join(projectDir, ".kalayaan", "wrangler.json");
  await writeFile(wranglerConfigPath, JSON.stringify(wranglerConfig, null, 2) + "\n");

  return { loaded, entryPath, wranglerConfig, wranglerConfigPath };
}

/** A stable-across-restarts secret for local dev sessions; deploy generates its own via Cloudflare secrets. */
async function devSessionSecret(projectDir: string): Promise<string> {
  const path = join(projectDir, ".kalayaan", "dev-secret.txt");
  if (existsSync(path)) return (await readFile(path, "utf-8")).trim();
  const secret = crypto.randomUUID() + crypto.randomUUID();
  await mkdir(join(projectDir, ".kalayaan"), { recursive: true });
  await writeFile(path, secret);
  return secret;
}
