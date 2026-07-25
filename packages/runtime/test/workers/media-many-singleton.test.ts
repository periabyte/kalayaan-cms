import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { D1Adapter, SYSTEM_TABLE_DDL } from "@kalayaan/adapter-d1";
import { testDiff, testSnapshot } from "../fixture.js";
import { authenticate, authHeaders, type AuthedRequest } from "./auth-helper.js";

interface TestEnv {
  DB: D1Database;
}

let auth: AuthedRequest;

// Seed the schema + system tables in the baseline; all worker requests stay in
// test bodies (see rbac.test.ts note on the workers pool's isolated storage).
beforeAll(async () => {
  const db = (env as unknown as TestEnv).DB;
  const snapshot = testSnapshot();
  const adapter = new D1Adapter(db, snapshot);
  await adapter.applyMigration(await adapter.planMigration(testDiff(), snapshot, null));
  for (const sql of SYSTEM_TABLE_DDL) await db.prepare(sql).run();
  auth = await authenticate();
});

const json = (res: Response) => res.json() as Promise<Record<string, unknown>>;

function uploadImage(filename: string) {
  return SELF.fetch("https://x/admin/api/media", {
    method: "PUT",
    headers: { ...authHeaders(auth), "content-type": "image/png", "x-filename": filename },
    body: new TextEncoder().encode(`bytes-${filename}`),
  });
}

const post = (path: string, body: unknown) =>
  SELF.fetch(`https://x${path}`, { method: "POST", headers: authHeaders(auth), body: JSON.stringify(body) });

describe("multi-media fields and singleton collections", () => {
  it("stores and reads back an ordered gallery of media ids", async () => {
    const a = (await json(await uploadImage("a.png"))).doc as { id: string };
    const b = (await json(await uploadImage("b.png"))).doc as { id: string };
    const cc = (await json(await uploadImage("c.png"))).doc as { id: string };

    // Create a post whose `gallery` (media, many) holds three assets in order.
    const created = await post("/admin/api/posts", {
      title: "Gallery post",
      slug: "gallery-post",
      gallery: [a.id, b.id, cc.id],
    });
    expect(created.status).toBe(201);
    const doc = (await json(created)).doc as { id: string; gallery: string[] };
    expect(doc.gallery).toEqual([a.id, b.id, cc.id]);

    // Reorder + drop one via PATCH; the join table reflects the new order.
    const patched = await SELF.fetch(`https://x/admin/api/posts/${doc.id}`, {
      method: "PATCH",
      headers: authHeaders(auth),
      body: JSON.stringify({ gallery: [cc.id, a.id] }),
    });
    expect(patched.status).toBe(200);
    expect(((await json(patched)).doc as { gallery: string[] }).gallery).toEqual([cc.id, a.id]);

    // Read back through the fetch-by-id path too.
    const read = (await json(await SELF.fetch(`https://x/admin/api/posts/${doc.id}`, { headers: { cookie: auth.cookie } }))).doc as {
      gallery: string[];
    };
    expect(read.gallery).toEqual([cc.id, a.id]);
  });

  it("enforces one entry per singleton and allows updating it", async () => {
    // First create for the singleton succeeds.
    const first = await post("/admin/api/about", { heading: "About us", published_at: Date.now() });
    expect(first.status).toBe(201);
    const about = (await json(first)).doc as { id: string };

    // A second create is rejected with 409.
    const second = await post("/admin/api/about", { heading: "Another about" });
    expect(second.status).toBe(409);

    // The sole entry can still be updated.
    const updated = await SELF.fetch(`https://x/admin/api/about/${about.id}`, {
      method: "PATCH",
      headers: authHeaders(auth),
      body: JSON.stringify({ heading: "About us, revised" }),
    });
    expect(updated.status).toBe(200);
    expect(((await json(updated)).doc as { heading: string }).heading).toBe("About us, revised");
  });

});
