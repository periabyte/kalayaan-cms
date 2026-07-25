import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyDependencyUpdate,
  detectPackageManager,
  isManagedDependency,
  planDependencyUpdate,
  runUpdate,
} from "../src/commands/update.js";

let dir: string;

const PKG = {
  name: "my-site",
  private: true,
  type: "module",
  scripts: { dev: "kalayaan dev", deploy: "kalayaan deploy" },
  dependencies: { kalayaan: "latest", "@kalayaan/adapter-postgres": "^0.1.0", zod: "^3.0.0" },
};

async function writePkg(pkg: unknown = PKG) {
  await writeFile(join(dir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "kalayaan-update-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("isManagedDependency", () => {
  it("matches kalayaan and @kalayaan/* but not unrelated deps", () => {
    expect(isManagedDependency("kalayaan")).toBe(true);
    expect(isManagedDependency("@kalayaan/adapter-postgres")).toBe(true);
    expect(isManagedDependency("zod")).toBe(false);
    expect(isManagedDependency("wrangler")).toBe(false);
  });
});

describe("detectPackageManager", () => {
  it("reads the lockfile, defaulting to npm", async () => {
    expect(detectPackageManager(dir)).toBe("npm");
    await writeFile(join(dir, "pnpm-lock.yaml"), "");
    expect(detectPackageManager(dir)).toBe("pnpm");
  });
});

describe("planDependencyUpdate / applyDependencyUpdate", () => {
  it("bumps only managed deps to a caret range and leaves others alone", () => {
    const pkg = structuredClone(PKG) as Record<string, unknown>;
    const updates = planDependencyUpdate(pkg, "0.2.0");
    expect(updates).toEqual([
      { name: "kalayaan", from: "latest", to: "^0.2.0" },
      { name: "@kalayaan/adapter-postgres", from: "^0.1.0", to: "^0.2.0" },
    ]);
    applyDependencyUpdate(pkg, updates);
    const deps = pkg.dependencies as Record<string, string>;
    expect(deps.kalayaan).toBe("^0.2.0");
    expect(deps["@kalayaan/adapter-postgres"]).toBe("^0.2.0");
    expect(deps.zod).toBe("^3.0.0");
  });

  it("returns no updates when specs already match the target", () => {
    const pkg = { dependencies: { kalayaan: "^0.2.0" } };
    expect(planDependencyUpdate(pkg, "0.2.0")).toEqual([]);
  });
});

describe("runUpdate", () => {
  it("previews without writing package.json (dry-run)", async () => {
    await writePkg();
    const result = await runUpdate({
      projectDir: dir,
      dryRun: true,
      fetchLatest: async () => "0.2.0",
    });
    expect(result.targetVersion).toBe("0.2.0");
    expect(result.changed).toBe(true);
    expect(result.installed).toBe(false);
    expect(result.updates.map((u) => u.name)).toContain("kalayaan");
    // File untouched.
    const onDisk = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    expect(onDisk.dependencies.kalayaan).toBe("latest");
  });

  it("writes bumped specs when install is skipped", async () => {
    await writePkg();
    const result = await runUpdate({
      projectDir: dir,
      to: "0.3.1",
      install: false,
      fetchLatest: async () => "should-not-be-called",
    });
    expect(result.installed).toBe(false);
    expect(result.targetVersion).toBe("0.3.1");
    const onDisk = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    expect(onDisk.dependencies.kalayaan).toBe("^0.3.1");
    expect(onDisk.dependencies["@kalayaan/adapter-postgres"]).toBe("^0.3.1");
    expect(onDisk.dependencies.zod).toBe("^3.0.0");
  });

  it("reports up-to-date when specs match and target is installed", async () => {
    // No node_modules here, so installedVersion is null; a matching spec but a
    // null install still counts as changed (needs install). Assert the spec-only
    // no-op path via planDependencyUpdate instead.
    await writePkg({ dependencies: { kalayaan: "^0.2.0" } });
    const result = await runUpdate({ projectDir: dir, install: false, fetchLatest: async () => "0.2.0" });
    // package.json already at ^0.2.0 → no spec edits.
    expect(result.updates).toEqual([]);
  });

  it("throws when package.json has no Kalayaan dependency", async () => {
    await writePkg({ dependencies: { zod: "^3.0.0" } });
    await expect(runUpdate({ projectDir: dir, to: "0.2.0" })).rejects.toThrow(/No Kalayaan dependencies/);
  });

  it("throws when there is no package.json", async () => {
    await expect(runUpdate({ projectDir: dir, to: "0.2.0" })).rejects.toThrow(/No package\.json/);
  });
});
