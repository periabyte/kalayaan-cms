import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { D1Adapter, SYSTEM_TABLE_DDL } from "@kalayaan/adapter-d1";
import { testDiff, testSnapshot } from "../fixture.js";
import { authenticate, authHeaders } from "./auth-helper.js";

interface TestEnv {
  DB: D1Database;
}

beforeAll(async () => {
  const db = (env as unknown as TestEnv).DB;
  const snapshot = testSnapshot();
  const adapter = new D1Adapter(db, snapshot);
  const plan = await adapter.planMigration(testDiff(), snapshot, null);
  await adapter.applyMigration(plan);
  // System tables (users, api_keys, media, _versions) aren't part of the
  // config-driven schema; create them directly, mirroring the CLI's deploy path.
  for (const sql of SYSTEM_TABLE_DDL) await db.prepare(sql).run();
});

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("auth", () => {
  it("blocks admin API access without credentials", async () => {
    const res = await SELF.fetch("https://x/admin/api/posts");
    expect(res.status).toBe(401);
    expect((await json(res)).error).toMatchObject({ code: "unauthorized" });
  });

  it("reports needsSetup before the first admin exists (public, no auth)", async () => {
    const res = await SELF.fetch("https://x/admin/api/auth/setup");
    expect(res.status).toBe(200);
    expect((await json(res)).needsSetup).toBe(true);
  });

  it("completes first-run setup and rejects a second attempt", async () => {
    const res = await SELF.fetch("https://x/admin/api/auth/setup", {
      method: "POST",
      body: JSON.stringify({ email: "owner@example.com", password: "supersecretpassword" }),
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect((body.user as { role: string }).role).toBe("admin");

    // Once an admin exists the public status flips to false.
    const status = await SELF.fetch("https://x/admin/api/auth/setup");
    expect((await json(status)).needsSetup).toBe(false);

    const again = await SELF.fetch("https://x/admin/api/auth/setup", {
      method: "POST",
      body: JSON.stringify({ email: "other@example.com", password: "anotherpassword" }),
    });
    expect(again.status).toBe(403);
  });

  it("rejects a login with the wrong password", async () => {
    const res = await SELF.fetch("https://x/admin/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "owner@example.com", password: "wrong-password" }),
    });
    expect(res.status).toBe(401);
  });

  it("lets an authenticated session read and write, but blocks writes without a CSRF token", async () => {
    const auth = await authenticate();

    const list = await SELF.fetch("https://x/admin/api/posts", { headers: { cookie: auth.cookie } });
    expect(list.status).toBe(200);

    const noCsrf = await SELF.fetch("https://x/admin/api/posts", {
      method: "POST",
      headers: { cookie: auth.cookie },
      body: JSON.stringify({ title: "No CSRF", slug: "no-csrf" }),
    });
    expect(noCsrf.status).toBe(403);

    const withCsrf = await SELF.fetch("https://x/admin/api/posts", {
      method: "POST",
      headers: authHeaders(auth),
      body: JSON.stringify({ title: "With CSRF", slug: "with-csrf" }),
    });
    expect(withCsrf.status).toBe(201);
  });

  it("me returns the session user and logout invalidates the session", async () => {
    const auth = await authenticate();
    const me = await json(
      await SELF.fetch("https://x/admin/api/auth/me", { headers: { cookie: auth.cookie } }),
    );
    expect((me.user as { email: string }).email).toBe("owner@example.com");

    await SELF.fetch("https://x/admin/api/auth/logout", {
      method: "POST",
      headers: authHeaders(auth),
    });
    const afterLogout = await SELF.fetch("https://x/admin/api/posts", {
      headers: { cookie: auth.cookie },
    });
    expect(afterLogout.status).toBe(401);
  });

  it("rejects a forged session cookie", async () => {
    const res = await SELF.fetch("https://x/admin/api/posts", {
      headers: { cookie: "kalayaan_session=totally-forged.badsignature" },
    });
    expect(res.status).toBe(401);
  });

  it("issues scoped API keys and enforces read/write and collection scope", async () => {
    const auth = await authenticate();

    const readOnly = await json(
      await SELF.fetch("https://x/admin/api/auth/api-keys", {
        method: "POST",
        headers: authHeaders(auth),
        body: JSON.stringify({ name: "ci-reader", scopes: ["read"], collections: ["authors"] }),
      }),
    );
    const rawKey = readOnly.rawKey as string;
    expect(rawKey.startsWith("kcms_")).toBe(true);

    const okRead = await SELF.fetch("https://x/admin/api/authors", {
      headers: { authorization: `Bearer ${rawKey}` },
    });
    expect(okRead.status).toBe(200);

    const wrongCollection = await SELF.fetch("https://x/admin/api/posts", {
      headers: { authorization: `Bearer ${rawKey}` },
    });
    expect(wrongCollection.status).toBe(403);

    // Bearer requests are CSRF-exempt but still scope-checked.
    const forbiddenWrite = await SELF.fetch("https://x/admin/api/authors", {
      method: "POST",
      headers: { authorization: `Bearer ${rawKey}` },
      body: JSON.stringify({ name: "Blocked" }),
    });
    expect(forbiddenWrite.status).toBe(403);

    const badKey = await SELF.fetch("https://x/admin/api/authors", {
      headers: { authorization: "Bearer kcms_not-a-real-key" },
    });
    expect(badKey.status).toBe(401);
  });

  it("only admins can manage API keys", async () => {
    const res = await SELF.fetch("https://x/admin/api/auth/api-keys");
    expect(res.status).toBe(401);
  });
});
