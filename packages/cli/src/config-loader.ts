import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import { resolveConfig, type EdgeCMSConfig, type ResolvedConfig } from "@kalayaan/config";
import { PluginHost, type Module, type Plugin } from "@kalayaan/core";

export const CONFIG_CANDIDATES = ["cms.config.ts", "cms.config.js", "cms.config.mjs", "cms.config.json"];
export const PLUGINS_CANDIDATES = ["cms.plugins.ts", "cms.plugins.js", "cms.plugins.mjs"];
export const MODULES_CANDIDATES = ["cms.modules.ts", "cms.modules.js", "cms.modules.mjs"];

export interface LoadedConfig {
  raw: EdgeCMSConfig;
  resolved: ResolvedConfig;
  /** Absolute path to the config file that was loaded. */
  path: string;
}

export function findConfigFile(projectDir: string): string | null {
  for (const candidate of CONFIG_CANDIDATES) {
    const path = join(projectDir, candidate);
    if (existsSync(path)) return path;
  }
  return null;
}

/** Locate an optional project plugins file (default-exports a Plugin[]). */
export function findPluginsFile(projectDir: string): string | null {
  for (const candidate of PLUGINS_CANDIDATES) {
    const path = join(projectDir, candidate);
    if (existsSync(path)) return path;
  }
  return null;
}

/** Locate an optional project modules file (default-exports a Module[]). */
export function findModulesFile(projectDir: string): string | null {
  for (const candidate of MODULES_CANDIDATES) {
    const path = join(projectDir, candidate);
    if (existsSync(path)) return path;
  }
  return null;
}

/**
 * If the project has a `cms.plugins.{ts,js,mjs}` file, bundle it (like the
 * config) into a `.kalayaan/plugins.generated.mjs` the generated Worker entry
 * can import. Plugins carry functions, so — unlike config — they can't be
 * serialized to pure data; bare imports stay external for wrangler to resolve.
 * Returns the generated module path, or null when there's no plugins file.
 */
export async function bundlePluginsModule(projectDir: string): Promise<string | null> {
  const src = findPluginsFile(projectDir);
  if (!src) return null;
  const outfile = join(projectDir, ".kalayaan", "plugins.generated.mjs");
  await mkdir(join(projectDir, ".kalayaan"), { recursive: true });
  await esbuild.build({
    entryPoints: [src],
    outfile,
    bundle: true,
    format: "esm",
    packages: "external",
    target: "es2022",
  });
  return outfile;
}

/**
 * Same as {@link bundlePluginsModule}, for an optional `cms.modules.{ts,js,mjs}`
 * (default-exports a Module[] — collections, routes, hooks, and provider
 * factories bundled together). Returns the generated module path, or null
 * when there's no modules file.
 */
export async function bundleModulesModule(projectDir: string): Promise<string | null> {
  const src = findModulesFile(projectDir);
  if (!src) return null;
  const outfile = join(projectDir, ".kalayaan", "modules.generated.mjs");
  await mkdir(join(projectDir, ".kalayaan"), { recursive: true });
  await esbuild.build({
    entryPoints: [src],
    outfile,
    bundle: true,
    format: "esm",
    packages: "external",
    target: "es2022",
  });
  return outfile;
}

/**
 * Bundles a TS/JS module (bare imports like "kalayaan" left external so they
 * resolve from the project's own node_modules) into a throwaway timestamped
 * `.kalayaan/.tmp` file, dynamically imports its default export, then deletes
 * it. Timestamped so re-importing after an edit within the same process
 * (e.g. repeated `loadConfig` calls) never hits Node's ESM module cache for a
 * stale file path.
 */
async function bundleAndImportDefault<T>(src: string, projectDir: string, prefix: string): Promise<T | undefined> {
  const outDir = join(projectDir, ".kalayaan", ".tmp");
  await mkdir(outDir, { recursive: true });
  const outfile = join(outDir, `${prefix}-${Date.now()}.mjs`);
  try {
    await esbuild.build({
      entryPoints: [src],
      outfile,
      bundle: true,
      format: "esm",
      platform: "node",
      packages: "external",
      target: "node20",
    });
    const mod = (await import(pathToFileURL(outfile).href)) as { default?: T };
    return mod.default;
  } finally {
    await rm(outfile, { force: true });
  }
}

/**
 * Loads and validates the user's cms.config.{ts,js,mjs,json} — the Worker
 * never reads this file directly; the CLI reuses the same bundling step to
 * embed it in the generated entry (see entry-template.ts). Role subjects are
 * validated against collections, the built-in system areas, and any custom
 * subject declared by the project's plugins/modules (`cms.plugins.ts`/
 * `cms.modules.ts`), so a role granting a plugin- or module-defined subject
 * like `"marketplace:order"` resolves cleanly instead of failing as "unknown
 * subject". A module's `collections` are merged into `raw.collections`
 * *before* `resolveConfig` runs, so `kalayaan migrate`/`doctor`/`deploy` see
 * and provision them exactly like collections declared directly in
 * `cms.config.ts`.
 */
export async function loadConfig(projectDir: string): Promise<LoadedConfig> {
  const path = findConfigFile(projectDir);
  if (!path)
    throw new Error(
      `No cms.config.{ts,js,mjs,json} found in ${projectDir}. Run "kalayaan init" to create one.`,
    );

  let raw: EdgeCMSConfig;
  if (path.endsWith(".json")) {
    raw = JSON.parse(await readFile(path, "utf-8")) as EdgeCMSConfig;
  } else {
    const loaded = await bundleAndImportDefault<EdgeCMSConfig>(path, projectDir, "config");
    if (!loaded)
      throw new Error(`${path} must have a default export (use "export default defineConfig({...})")`);
    raw = loaded;
  }

  const pluginsPath = findPluginsFile(projectDir);
  const plugins = pluginsPath ? await bundleAndImportDefault<Plugin[]>(pluginsPath, projectDir, "plugins") : undefined;

  const modulesPath = findModulesFile(projectDir);
  const modules = modulesPath ? await bundleAndImportDefault<Module[]>(modulesPath, projectDir, "modules") : undefined;
  if (modules?.length) raw = { ...raw, collections: [...raw.collections, ...modules.flatMap((m) => m.collections ?? [])] };

  const extraSubjects = new PluginHost([...(plugins ?? []), ...(modules ?? [])]).subjects();

  return { raw, resolved: resolveConfig(raw, { extraSubjects }), path };
}

/**
 * Writes the validated raw config as a pure-data ESM module. The generated
 * Worker entry imports this instead of the user's original TS/JS/JSON
 * source — field builders only ever produce JSON-serializable objects, so
 * this round-trips exactly, and the Worker bundle step never has to parse
 * TypeScript or resolve the user's own "kalayaan" import.
 */
export async function writeGeneratedConfigModule(
  projectDir: string,
  config: EdgeCMSConfig,
): Promise<string> {
  const path = join(projectDir, ".kalayaan", "config.generated.mjs");
  await mkdir(join(projectDir, ".kalayaan"), { recursive: true });
  await writeFile(
    path,
    `// AUTO-GENERATED by kalayaan from your cms.config file — do not edit.\nexport default ${JSON.stringify(config, null, 2)};\n`,
  );
  return path;
}
