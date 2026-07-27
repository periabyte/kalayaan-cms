import { describe, expect, it, vi } from "vitest";
import { PluginHost, type HookContext, type Module, type Plugin } from "../src/plugin.js";
import type { PaymentProvider } from "../src/payment.js";

const ctx = (over: Partial<HookContext> = {}): HookContext => ({
  collection: "posts",
  operation: "create",
  data: {},
  actor: null,
  ...over,
});

describe("PluginHost", () => {
  it("threads beforeChange data through plugins in order", async () => {
    const a: Plugin = { name: "a", hooks: { beforeChange: (c) => ({ ...c.data, seen: ["a"] }) } };
    const b: Plugin = {
      name: "b",
      hooks: { beforeChange: (c) => ({ ...c.data, seen: [...(c.data.seen as string[]), "b"] }) },
    };
    const out = await new PluginHost([a, b]).beforeChange(ctx({ data: {} }));
    expect(out.seen).toEqual(["a", "b"]);
  });

  it("awaits async beforeChange transforms", async () => {
    const p: Plugin = {
      name: "slugify",
      hooks: { beforeChange: async (c) => ({ ...c.data, slug: String(c.data.title).toLowerCase() }) },
    };
    const out = await new PluginHost([p]).beforeChange(ctx({ data: { title: "HELLO" } }));
    expect(out.slug).toBe("hello");
  });

  it("runs afterChange for every plugin and afterPublish only when asked", async () => {
    const afterChange = vi.fn();
    const afterPublish = vi.fn();
    const host = new PluginHost([{ name: "p", hooks: { afterChange, afterPublish } }]);
    await host.afterChange(ctx());
    expect(afterChange).toHaveBeenCalledOnce();
    expect(afterPublish).not.toHaveBeenCalled();
    await host.afterPublish(ctx());
    expect(afterPublish).toHaveBeenCalledOnce();
  });

  it("merges custom field-type validators across plugins", () => {
    const host = new PluginHost([
      { name: "geo", fieldTypes: { latlng: (v) => v } },
      { name: "color", fieldTypes: { hex: (v) => String(v).toUpperCase() } },
    ]);
    const types = host.fieldTypes();
    expect(Object.keys(types).sort()).toEqual(["hex", "latlng"]);
    expect(types.hex!("#abc")).toBe("#ABC");
  });

  it("is a no-op with no plugins", async () => {
    const host = new PluginHost();
    expect(await host.beforeChange(ctx({ data: { a: 1 } }))).toEqual({ a: 1 });
    await expect(host.afterDelete(ctx({ operation: "delete" }))).resolves.toBeUndefined();
  });

  it("dedupes routes across plugins and throws on a method+path collision", () => {
    const a: Plugin = { name: "a", routes: [{ method: "GET", path: "/x", handler: () => ({}) }] };
    const b: Plugin = { name: "b", routes: [{ method: "POST", path: "/y", handler: () => ({}) }] };
    expect(new PluginHost([a, b]).routes().map((r) => r.path)).toEqual(["/x", "/y"]);

    const clash: Plugin = { name: "c", routes: [{ method: "GET", path: "/x", handler: () => ({}) }] };
    expect(() => new PluginHost([a, clash]).routes()).toThrow(/Duplicate plugin route/);
  });

  it("collects declared and route-implied custom subjects, deduplicated", () => {
    const marketplace: Plugin = {
      name: "marketplace",
      subjects: ["marketplace:payout"],
      routes: [
        { method: "POST", path: "/orders", permission: { action: "create", subject: "marketplace:order" }, handler: () => ({}) },
        // Same subject as another plugin's declared `subjects` — should not duplicate.
        { method: "GET", path: "/payouts", permission: { action: "read", subject: "marketplace:payout" }, handler: () => ({}) },
      ],
    };
    const subjects = new PluginHost([marketplace]).subjects();
    expect(subjects.sort()).toEqual(["marketplace:order", "marketplace:payout"]);
  });

  it("treats a Module's routes/hooks/fieldTypes/subjects like a Plugin's", async () => {
    const fake: PaymentProvider = {
      createIntent: vi.fn(),
      retrieveIntent: vi.fn(),
      refund: vi.fn(),
    };
    const marketplace: Module = {
      name: "marketplace",
      collections: [{ name: "orders", fields: {} }],
      subjects: ["marketplace:order"],
      routes: [{ method: "POST", path: "/orders", handler: () => ({}) }],
      fieldTypes: { money: (v) => v },
      provides: { payment: () => fake },
    };
    const host = new PluginHost([marketplace]);
    expect(host.routes()).toHaveLength(1);
    expect(host.subjects()).toEqual(["marketplace:order"]);
    expect(Object.keys(host.fieldTypes())).toEqual(["money"]);
  });

  it("builds the payment provider from the first module whose provides.payment factory is set", () => {
    const fake: PaymentProvider = { createIntent: vi.fn(), retrieveIntent: vi.fn(), refund: vi.fn() };
    const factory = vi.fn(() => fake);
    const withoutPayment: Module = { name: "a" };
    const withPayment: Module = { name: "b", provides: { payment: factory } };
    const host = new PluginHost([withoutPayment, withPayment]);
    const env = { STRIPE_SECRET_KEY: "sk_test" };
    expect(host.payment(env)).toBe(fake);
    expect(factory).toHaveBeenCalledWith(env);
  });

  it("returns undefined for payment() when no module provides one", () => {
    expect(new PluginHost([{ name: "a" } as Plugin]).payment({})).toBeUndefined();
    expect(new PluginHost().payment({})).toBeUndefined();
  });
});
