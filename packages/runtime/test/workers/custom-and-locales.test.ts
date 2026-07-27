import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { D1Adapter, SYSTEM_TABLE_DDL } from "@kalayaan/adapter-d1";
import { testDiff, testSnapshot } from "../fixture.js";
import { authenticate, authHeaders, type AuthedRequest } from "./auth-helper.js";

let auth: AuthedRequest;

beforeAll(async () => {
  const db = (env as unknown as { DB: D1Database }).DB;
  const snapshot = testSnapshot();
  const adapter = new D1Adapter(db, snapshot);
  await adapter.applyMigration(await adapter.planMigration(testDiff(), snapshot, null));
  for (const sql of SYSTEM_TABLE_DDL) await db.prepare(sql).run();
  auth = await authenticate();
});

const json = async (res: Response) => (await res.json()) as Record<string, unknown>;
const post = (path: string, body: unknown) =>
  SELF.fetch(`https://x${path}`, { method: "POST", headers: authHeaders(auth), body: JSON.stringify(body) });
const patch = (path: string, body: unknown) =>
  SELF.fetch(`https://x${path}`, { method: "PATCH", headers: authHeaders(auth), body: JSON.stringify(body) });
const get = (path: string) => SELF.fetch(`https://x${path}`, { headers: { cookie: auth.cookie } });

describe("custom field types", () => {
  it("runs the plugin validator on write (transforms the value)", async () => {
    const res = await post("/admin/api/pages", { title: "Custom", badge: "#1a2b3c" });
    expect(res.status).toBe(201);
    const doc = (await json(res)).doc as { badge: string };
    expect(doc.badge).toBe("#1A2B3C"); // uppercased by the hex validator
  });

  it("rejects an invalid custom value with a validation error", async () => {
    const res = await post("/admin/api/pages", { title: "Bad", badge: "not-a-color" });
    expect(res.status).toBe(422);
    const body = await json(res);
    expect((body.error as { message: string }).message).toMatch(/hex color/);
  });

  it("advertises registered custom field types on the schema", async () => {
    const schema = await json(await get("/admin/api/schema"));
    const features = schema.features as { customFieldTypes: string[] };
    expect(features.customFieldTypes).toContain("hex");
  });

  it("advertises plugin-declared and route-implied custom subjects on the schema", async () => {
    const schema = await json(await get("/admin/api/schema"));
    const features = schema.features as { customSubjects: string[] };
    // Explicitly declared via Plugin.subjects (not tied to any route).
    expect(features.customSubjects).toContain("marketplace:order");
    // Implicitly declared via a route's permission.subject.
    expect(features.customSubjects).toContain("posts");
  });
});

describe("mt-review write path", () => {
  it("records an mt-review version when ?review=mt and lights the list flag", async () => {
    const created = await json(await post("/admin/api/pages", { title: "Doc EN", badge: "#000000" }));
    const id = (created.doc as { id: string }).id;

    // A normal update leaves the entity un-flagged.
    await patch(`/admin/api/pages/${id}`, { title: "Doc EN v2" });
    let list = (await json(await get("/admin/api/pages"))).docs as { id: string; mt: boolean }[];
    expect(list.find((d) => d.id === id)?.mt).toBe(false);

    // A review write records an mt-review version → the flag lights.
    const res = await patch(`/admin/api/pages/${id}?review=mt`, { title: "Doc EN reviewed" });
    expect(res.status).toBe(200);
    const versions = (await json(await get(`/admin/api/pages/${id}/versions`))).versions as { status: string }[];
    expect(versions[0]!.status).toBe("mt-review");

    list = (await json(await get("/admin/api/pages"))).docs as { id: string; mt: boolean }[];
    expect(list.find((d) => d.id === id)?.mt).toBe(true);
  });
});

describe("per-locale editing", () => {
  it("resolves a locale variant, returns null when absent, and creates a linked variant", async () => {
    const created = await json(await post("/admin/api/pages", { title: "Base EN", badge: "#ffffff" }));
    const base = created.doc as { id: string; entity_id: string; locale: string };
    expect(base.locale).toBe("en");

    // The German variant doesn't exist yet.
    const missing = await json(await get(`/admin/api/pages/${base.id}?locale=de`));
    expect(missing.doc).toBeNull();

    // Create it as a sibling sharing entity_id.
    const de = await json(
      await post("/admin/api/pages", { title: "Basis DE", badge: "#ffffff", entity_id: base.entity_id, locale: "de" }),
    );
    const deDoc = de.doc as { id: string; locale: string; entity_id: string };
    expect(deDoc.locale).toBe("de");
    expect(deDoc.entity_id).toBe(base.entity_id);
    expect(deDoc.id).not.toBe(base.id);

    // Now it resolves via ?locale=de, and the base still resolves at ?locale=en.
    const loadedDe = await json(await get(`/admin/api/pages/${base.id}?locale=de`));
    expect((loadedDe.doc as { title: string }).title).toBe("Basis DE");
    const loadedEn = await json(await get(`/admin/api/pages/${base.id}?locale=en`));
    expect((loadedEn.doc as { title: string }).title).toBe("Base EN");
  });

  it("rejects an unknown locale", async () => {
    const created = await json(await post("/admin/api/pages", { title: "X", badge: "#010101" }));
    const id = (created.doc as { id: string }).id;
    const res = await get(`/admin/api/pages/${id}?locale=fr`);
    expect(res.status).toBe(400);
  });
});
