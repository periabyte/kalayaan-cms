import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { D1Adapter, SYSTEM_TABLE_DDL } from "@kalayaan/adapter-d1";
import { testDiff, testSnapshot } from "../fixture.js";
import { UsersStore } from "../../src/auth/users-store.js";
import { authHeaders, loginAs, type AuthedRequest } from "./auth-helper.js";

const PW = "supersecretpassword";

beforeAll(async () => {
  const db = (env as unknown as { DB: D1Database }).DB;
  const snapshot = testSnapshot();
  const adapter = new D1Adapter(db, snapshot);
  await adapter.applyMigration(await adapter.planMigration(testDiff(), snapshot, null));
  for (const sql of SYSTEM_TABLE_DDL) await db.prepare(sql).run();
  const users = new UsersStore(db);
  await users.create("admin@example.com", PW, "admin");
  await users.create("viewer2@example.com", PW, "viewer");
});

const json = async (res: Response) => (await res.json()) as Record<string, unknown>;

describe("plugin routes (/api/ext)", () => {
  it("requires auth by default and 401s without credentials", async () => {
    const res = await SELF.fetch("https://x/api/ext/whoami");
    expect(res.status).toBe(401);
  });

  it("resolves the authenticated actor in the route context", async () => {
    const admin = await loginAs("admin@example.com", PW);
    const res = await SELF.fetch("https://x/api/ext/whoami", { headers: { cookie: admin.cookie } });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.type).toBe("user");
  });

  it("allows anonymous access to routes marked public", async () => {
    const res = await SELF.fetch("https://x/api/ext/public-ping");
    expect(res.status).toBe(200);
    expect((await json(res)).ok).toBe(true);
  });

  it("touches multiple collections via DataApi, atomically, with hooks/versioning applied", async () => {
    const admin = await loginAs("admin@example.com", PW);
    const authorRes = await SELF.fetch("https://x/admin/api/authors", {
      method: "POST",
      headers: authHeaders(admin),
      body: JSON.stringify({ name: "Ada Lovelace" }),
    });
    const { doc: author } = (await json(authorRes)) as { doc: { id: string } };

    const res = await SELF.fetch(`https://x/api/ext/authors/${author.id}/posts`, {
      method: "POST",
      headers: authHeaders(admin),
      body: JSON.stringify({ title: "Cross-collection post", slug: "cross-collection-post" }),
    });
    expect(res.status).toBe(200);
    const post = await json(res);
    expect(post.title).toBe("Cross-collection post");
    expect(post.author).toBe(author.id);

    // The route's second write (via the same tx) updated the author too.
    const updatedAuthor = await json(
      await SELF.fetch(`https://x/admin/api/authors/${author.id}`, { headers: { cookie: admin.cookie } }),
    );
    expect((updatedAuthor.doc as { name: string }).name).toBe("Ada Lovelace (published)");
  });

  it("enforces the route's declared permission (RBAC), independent of the handler's own logic", async () => {
    const viewer: AuthedRequest = await loginAs("viewer2@example.com", PW);
    const res = await SELF.fetch("https://x/api/ext/authors/nonexistent/posts", {
      method: "POST",
      headers: authHeaders(viewer),
      body: JSON.stringify({ title: "Should be blocked", slug: "should-be-blocked" }),
    });
    expect(res.status).toBe(403);
  });

  it("404s an unknown /api/ext path (no plugin route registered)", async () => {
    const admin = await loginAs("admin@example.com", PW);
    const res = await SELF.fetch("https://x/api/ext/does-not-exist", { headers: { cookie: admin.cookie } });
    expect(res.status).toBe(404);
  });
});
