import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("GET / (API root page)", () => {
  it("returns a small branded HTML page for browser navigations", async () => {
    const res = await SELF.fetch("https://x/", { headers: { accept: "text/html,application/xhtml+xml" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain("This is a Kalayaan CMS.");
    // Site name still titles the page; the body is headless-splash only —
    // no API endpoints or admin routes are exposed, just the project CTA.
    expect(body).toContain("test-site");
    expect(body).toContain('href="https://kalayaan.periabyte.dev"');
    expect(body).not.toContain('href="/api/v1"');
    expect(body).not.toContain('href="/admin"');
    expect(body).not.toContain('href="/mcp"');
  });

  it("falls through to the existing JSON 404 for non-HTML clients", async () => {
    const res = await SELF.fetch("https://x/", { headers: { accept: "application/json" } });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("not_found");
  });

  it("falls through to the JSON 404 when no Accept header is sent", async () => {
    const res = await SELF.fetch("https://x/");
    expect(res.status).toBe(404);
  });
});
