import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { findConfigFile, loadConfig } from "../config-loader.js";
import { lastSnapshot, readState } from "../state.js";
import { planMigration } from "../migration.js";

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export interface DependencyUpdate {
  name: string;
  /** The existing version spec in package.json (e.g. "latest", "^0.1.3"). */
  from: string;
  /** The new spec written (a caret range on the target version). */
  to: string;
}

export interface UpdateOptions {
  projectDir: string;
  /** Target version (e.g. "0.2.0"); defaults to the registry `latest` dist-tag. */
  to?: string;
  /** Preview only — don't write package.json or install. */
  dryRun?: boolean;
  /** Run the package-manager install after editing package.json (default true). */
  install?: boolean;
  /** Injectable for tests — resolve the latest published version of a package. */
  fetchLatest?: (pkg: string) => Promise<string>;
}

export interface UpdateResult {
  packageManager: PackageManager;
  /** Version currently in node_modules, or null if not installed yet. */
  installedVersion: string | null;
  targetVersion: string;
  /** package.json spec edits that were (or would be) written. */
  updates: DependencyUpdate[];
  /** True when package.json edits or an install are needed to reach the target. */
  changed: boolean;
  /** True once the package-manager install actually ran. */
  installed: boolean;
  /** Pending schema migration after the update (drift), when it could be computed. */
  pendingMigration?: { statements: number; destructive: boolean };
}

const REGISTRY = "https://registry.npmjs.org";

/** A dep this command manages: the umbrella `kalayaan` or any `@kalayaan/*` package. */
export function isManagedDependency(name: string): boolean {
  return name === "kalayaan" || name.startsWith("@kalayaan/");
}

/** Pick the project's package manager from its lockfile, defaulting to npm. */
export function detectPackageManager(projectDir: string): PackageManager {
  if (existsSync(join(projectDir, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(projectDir, "yarn.lock"))) return "yarn";
  if (existsSync(join(projectDir, "bun.lockb")) || existsSync(join(projectDir, "bun.lock"))) return "bun";
  return "npm";
}

/** Resolve the `latest` dist-tag version of a package from the npm registry. */
export async function fetchLatestVersion(pkg: string): Promise<string> {
  const res = await fetch(`${REGISTRY}/${encodeURIComponent(pkg)}/latest`);
  if (!res.ok)
    throw new Error(`Could not fetch the latest version of "${pkg}" from npm (HTTP ${res.status}).`);
  const body = (await res.json()) as { version?: string };
  if (!body.version) throw new Error(`npm returned no version for "${pkg}".`);
  return body.version;
}

/** Version installed in node_modules (read directly, since `kalayaan` doesn't export package.json). */
function readInstalledVersion(projectDir: string, pkg = "kalayaan"): string | null {
  try {
    const json = JSON.parse(
      readFileSync(join(projectDir, "node_modules", pkg, "package.json"), "utf8"),
    ) as { version?: string };
    return json.version ?? null;
  } catch {
    return null;
  }
}

/** Compute the package.json spec edits for a target version (caret range) across deps + devDeps. */
export function planDependencyUpdate(
  pkgJson: Record<string, unknown>,
  targetVersion: string,
): DependencyUpdate[] {
  const updates: DependencyUpdate[] = [];
  const spec = `^${targetVersion}`;
  for (const field of ["dependencies", "devDependencies"] as const) {
    const deps = pkgJson[field] as Record<string, string> | undefined;
    if (!deps) continue;
    for (const [name, current] of Object.entries(deps)) {
      if (!isManagedDependency(name) || current === spec) continue;
      updates.push({ name, from: current, to: spec });
    }
  }
  return updates;
}

/** Apply spec edits in place to a parsed package.json object. */
export function applyDependencyUpdate(
  pkgJson: Record<string, unknown>,
  updates: DependencyUpdate[],
): void {
  for (const u of updates) {
    for (const field of ["dependencies", "devDependencies"] as const) {
      const deps = pkgJson[field] as Record<string, string> | undefined;
      if (deps && u.name in deps) deps[u.name] = u.to;
    }
  }
}

/**
 * `kalayaan update`: bump the project's Kalayaan dependencies (the `kalayaan`
 * package and any `@kalayaan/*` packages) to the latest release — or a specific
 * `--to` version — then install and surface any schema drift so the user knows
 * whether a `migrate` + redeploy is due. wrangler comes in transitively via
 * `kalayaan`, so it isn't listed here.
 */
export async function runUpdate(opts: UpdateOptions): Promise<UpdateResult> {
  const { projectDir } = opts;
  const pkgPath = join(projectDir, "package.json");
  if (!existsSync(pkgPath))
    throw new Error(`No package.json in ${projectDir}. Run this from your Kalayaan project directory.`);

  const pkgJson = JSON.parse(await readFile(pkgPath, "utf8")) as Record<string, unknown>;
  const names = [
    ...Object.keys((pkgJson.dependencies as Record<string, string>) ?? {}),
    ...Object.keys((pkgJson.devDependencies as Record<string, string>) ?? {}),
  ].filter(isManagedDependency);
  if (names.length === 0)
    throw new Error('No Kalayaan dependencies found in package.json (expected "kalayaan").');

  const fetchLatest = opts.fetchLatest ?? fetchLatestVersion;
  const targetVersion = opts.to ?? (await fetchLatest("kalayaan"));
  const installedVersion = readInstalledVersion(projectDir);
  const packageManager = detectPackageManager(projectDir);

  const updates = planDependencyUpdate(pkgJson, targetVersion);
  const changed = updates.length > 0 || installedVersion !== targetVersion;

  // Preview, or already-current: report without touching anything.
  if (opts.dryRun || !changed)
    return { packageManager, installedVersion, targetVersion, updates, changed, installed: false };

  if (updates.length > 0) {
    applyDependencyUpdate(pkgJson, updates);
    await writeFile(pkgPath, JSON.stringify(pkgJson, null, 2) + "\n");
  }

  let installed = false;
  if (opts.install !== false) {
    execFileSync(packageManager, ["install"], { cwd: projectDir, stdio: "inherit" });
    installed = true;
  }

  const result: UpdateResult = {
    packageManager,
    installedVersion,
    targetVersion,
    updates,
    changed,
    installed,
  };

  // A new version could resolve the config differently (new reserved names,
  // changed snapshot shape); surface any drift so the user runs migrate + deploy.
  if (installed && findConfigFile(projectDir)) {
    try {
      const loaded = await loadConfig(projectDir);
      const plan = planMigration(loaded.resolved, lastSnapshot(await readState(projectDir)));
      result.pendingMigration = { statements: plan.statements.length, destructive: plan.destructive };
    } catch {
      // Advisory only — never fail an otherwise-successful update on this.
    }
  }
  return result;
}
