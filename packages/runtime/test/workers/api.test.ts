import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { D1Adapter, SYSTEM_TABLE_DDL } from "@kalayaan/adapter-d1";
import { testDiff, testSnapshot } from "../fixture.js";
import { authenticate, authHeaders, type AuthedRequest } from "./auth-helper.js";

interface TestEnv {
  DB: D1Database;
}

let auth: AuthedRequest;

beforeAll(async () => {
  const db = (env as unknown as TestEnv).DB;
  const snapshot = testSnapshot();
  const adapter = new D1Adapter(db, snapshot);
  const plan = await adapter.planMigration(testDiff(), snapshot, null);
  await adapter.applyMigration(plan);
  // System tables aren't part of the config-driven schema; create them
  // directly, mirroring what the CLI's deploy path does.
  for (const sql of SYSTEM_TABLE_DDL) await db.prepare(sql).run();
  auth = await authenticate();
});

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

function post(path: string, body: unknown) {
  return SELF.fetch(`https://x${path}`, {
    method: "POST",
    headers: authHeaders(auth),
    body: JSON.stringify(body),
  });
}

function patch(path: string, body: unknown) {
  return SELF.fetch(`https://x${path}`, {
    method: "PATCH",
    headers: authHeaders(auth),
    body: JSON.stringify(body),
  });
}

function get(path: string) {
  return SELF.fetch(`https://x${path}`, { headers: { cookie: auth.cookie } });
}

describe("runtime API", () => {
  it("creates via admin API and rejects invalid bodies", async () => {
    const bad = await post("/admin/api/posts", { title: "" });
    expect(bad.status).toBe(422);
    const badBody = await json(bad);
    expect((badBody.error as { code: string }).code).toBe("validation_failed");

    const created = await post("/admin/api/posts", { title: "Hello World", slug: "hello-world" });
    expect(created.status).toBe(201);
    const { doc } = await json(created);
    expect((doc as { title: string }).title).toBe("Hello World");
    expect((doc as { status: string }).status).toBe("draft");
  });

  it("auto-generates a slug from the source field when none is provided", async () => {
    const created = await json(await post("/admin/api/posts", { title: "Auto Slug Please!" }));
    expect((created.doc as { slug: string }).slug).toBe("auto-slug-please");
  });

  it("de-duplicates colliding slugs with a numeric suffix", async () => {
    const first = await json(await post("/admin/api/posts", { title: "Dupe Title" }));
    const second = await json(await post("/admin/api/posts", { title: "Dupe Title" }));
    const third = await json(await post("/admin/api/posts", { title: "Dupe Title" }));
    expect((first.doc as { slug: string }).slug).toBe("dupe-title");
    expect((second.doc as { slug: string }).slug).toBe("dupe-title-2");
    expect((third.doc as { slug: string }).slug).toBe("dupe-title-3");
  });

  it("hides drafts from the public content API but shows them in admin", async () => {
    await post("/admin/api/posts", { title: "Draft Post", slug: "draft-post" });

    const publicList = await json(await SELF.fetch("https://x/api/v1/posts"));
    expect((publicList.docs as unknown[]).some((d) => (d as { slug: string }).slug === "draft-post")).toBe(
      false,
    );

    const adminList = await json(await get("/admin/api/posts"));
    expect((adminList.docs as unknown[]).some((d) => (d as { slug: string }).slug === "draft-post")).toBe(
      true,
    );
  });

  it("publishing (setting published_at) makes a doc visible on the public API", async () => {
    const created = await json(await post("/admin/api/posts", { title: "Publish Me", slug: "publish-me" }));
    const id = (created.doc as { id: string }).id;

    await patch(`/admin/api/posts/${id}`, { published_at: Date.now() - 1000 });

    const publicOne = await SELF.fetch("https://x/api/v1/posts/publish-me");
    expect(publicOne.status).toBe(200);
    const { doc } = await json(publicOne);
    expect((doc as { title: string }).title).toBe("Publish Me");
  });

  it("404s a published doc lookup before it is published", async () => {
    await post("/admin/api/posts", { title: "Unpublished", slug: "unpublished" });
    const res = await SELF.fetch("https://x/api/v1/posts/unpublished");
    expect(res.status).toBe(404);
  });

  it("updates and deletes via admin API", async () => {
    const created = await json(await post("/admin/api/posts", { title: "Temp", slug: "temp" }));
    const id = (created.doc as { id: string }).id;

    const updated = await json(await patch(`/admin/api/posts/${id}`, { views: 5 }));
    expect((updated.doc as { views: number }).views).toBe(5);

    const del = await SELF.fetch(`https://x/admin/api/posts/${id}`, {
      method: "DELETE",
      headers: authHeaders(auth),
    });
    expect(del.status).toBe(204);
    expect((await get(`/admin/api/posts/${id}`)).status).toBe(404);
  });

  it("filters, sorts, and paginates through the query-param grammar", async () => {
    for (let i = 0; i < 3; i++) {
      await post("/admin/api/posts", { title: `Sortable ${i}`, slug: `sortable-${i}`, views: i });
    }
    const filtered = await json(await get("/admin/api/posts?filter[title][contains]=Sortable"));
    expect((filtered.docs as unknown[]).length).toBeGreaterThanOrEqual(3);

    const sorted = await json(
      await get("/admin/api/posts?filter[title][contains]=Sortable&sort=views&limit=2"),
    );
    const docs = sorted.docs as { views: number }[];
    expect(docs).toHaveLength(2);
    expect(docs[0]!.views).toBeLessThanOrEqual(docs[1]!.views);
  });

  it("serves the schema endpoint for the admin UI", async () => {
    const res = await SELF.fetch("https://x/admin/api/schema");
    expect(res.status).toBe(200);
    const schema = await json(res);
    expect(schema.name).toBe("test-site");
    const collections = schema.collections as { name: string }[];
    expect(collections.map((c) => c.name)).toEqual(["posts", "authors", "about", "pages"]);
    expect(collections.find((c) => c.name === "about")).toMatchObject({ singleton: true });
  });

  it("returns the shared error body shape for unknown collections", async () => {
    const res = await SELF.fetch("https://x/api/v1/nope");
    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body).toMatchObject({ error: { code: "not_found" } });
  });

  it("404s unknown routes with the shared error shape", async () => {
    const res = await SELF.fetch("https://x/nope");
    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ error: { code: "not_found" } });
  });
});
