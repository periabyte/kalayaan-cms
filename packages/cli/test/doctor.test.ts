import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runDoctor } from "../src/commands/doctor.js";

let dir: string;
let home: string;
let originalHome: string | undefined;
let originalUserProfile: string | undefined;

const CONFIG_TS = `
import { defineConfig, collection, field } from "kalayaan";
export default defineConfig({
  name: "doctor-site",
  collections: [collection("posts", { fields: { title: field.text({ required: true }) } })],
});
`;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "kalayaan-doctor-"));
  // Isolate the home dir so a real `~/.kalayaan/credentials.json` (from an actual
  // `kalayaan login` on the dev's machine) can't leak in and make the
  // missing-credentials assertion non-deterministic. homedir() honors these.
  home = await mkdtemp(join(tmpdir(), "kalayaan-home-"));
  originalHome = process.env.HOME;
  originalUserProfile = process.env.USERPROFILE;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  if (originalUserProfile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = originalUserProfile;
  delete process.env.EDGE_API_TOKEN;
  delete process.env.EDGE_ACCOUNT_ID;
});

describe("runDoctor", () => {
  it("fails fast with a clear message when no config file exists", async () => {
    const checks = await runDoctor(dir);
    expect(checks).toEqual([
      expect.objectContaining({ name: "config", status: "fail" }),
    ]);
  });

  it("reports config ok, wrangler ok, and a warning for missing Cloudflare credentials", async () => {
    await writeFile(join(dir, "cms.config.ts"), CONFIG_TS);
    await mkdir(join(dir, "node_modules"), { recursive: true });
    await symlink(join(import.meta.dirname, "../../kalayaan"), join(dir, "node_modules", "kalayaan"), "dir").catch(
      () => undefined,
    );
    delete process.env.EDGE_API_TOKEN;
    delete process.env.EDGE_ACCOUNT_ID;

    const checks = await runDoctor(dir);
    const byName = Object.fromEntries(checks.map((c) => [c.name, c]));
    expect(byName.config?.status).toBe("ok");
    expect(byName.wrangler?.status).toBe("ok");
    expect(byName["cloudflare-credentials"]?.status).toBe("warn");
    expect(byName.migrations?.status).toBe("warn"); // no migration applied yet
    expect(byName.migrations?.message).toContain("kalayaan migrate");
  }, 20_000);
});
