import { createApp, type Bindings } from "../../src/app.js";
import type { AiBinding } from "../../src/ai/workers-ai-provider.js";
import type { Plugin } from "@kalayaan/core";
import { testResolved, testSnapshot } from "../fixture.js";

/**
 * A deliberately narrow plugin: only rewrites a post titled exactly "hook-me"
 * so it's observable in a dedicated test without disturbing every other write.
 */
const testPlugin: Plugin = {
  name: "test-observability",
  hooks: {
    beforeChange: (ctx) =>
      ctx.data.title === "hook-me" ? { ...ctx.data, title: "hooked!" } : ctx.data,
  },
};

/** Custom field-type validator for the `pages.badge` field (see fixture.ts). */
const colorPlugin: Plugin = {
  name: "color",
  fieldTypes: {
    hex(value: unknown): string {
      const s = String(value ?? "").trim();
      if (!/^#[0-9a-fA-F]{6}$/.test(s)) throw new Error("expected a hex color like #1a2b3c");
      return s.toUpperCase();
    },
  },
};

/**
 * Exercises the `Plugin.routes` extension seam: business-specific endpoints
 * that reach across collections (`authors` + `posts`) through the RBAC- and
 * hook-aware `DataApi`, mounted at `/api/ext`.
 */
const extensionPlugin: Plugin = {
  name: "test-extensions",
  // Not referenced by any route's `permission` — exercises the explicit
  // `Plugin.subjects` declaration path (as opposed to the implicit one
  // inferred from `/authors/:id/posts`'s `permission: { subject: "posts" }`
  // below), so a role could grant "marketplace:order" in cms.config.ts.
  subjects: ["marketplace:order"],
  routes: [
    {
      method: "GET",
      path: "/whoami",
      handler: (ctx) => ({ type: ctx.actor.type, id: ctx.actor.id }),
    },
    {
      method: "GET",
      path: "/public-ping",
      public: true,
      handler: () => ({ ok: true }),
    },
    {
      method: "POST",
      path: "/authors/:id/posts",
      permission: { action: "create", subject: "posts" },
      handler: async (ctx) => {
        const authorId = ctx.params.id;
        const author = await ctx.db.collection("authors").findOne({ id: authorId });
        if (!author) return new Response("author not found", { status: 404 });
        const body = await ctx.json<{ title: string; slug: string }>();
        return ctx.db.tx(async (db) => {
          const post = await db.collection("posts").create({ title: body.title, slug: body.slug, author: authorId });
          await db.collection("authors").update(authorId, { name: `${author.name as string} (published)` });
          return post;
        });
      },
    },
  ],
};

const app = createApp(testResolved(), testSnapshot(), { plugins: [testPlugin, colorPlugin, extensionPlugin] });

/**
 * Deterministic stand-in for the Workers AI binding — the real one is
 * non-deterministic and unavailable in the local test runtime. Returns
 * recognizable output per model so assertions can pin exact strings.
 */
const fakeAI: AiBinding = {
  run: async (model: string, inputs: Record<string, unknown>) => {
    if (model.includes("vision")) return { description: "a mocked alt text description" };
    if (model.includes("m2m100")) return { translated_text: `translated:${String(inputs.text)}` };
    return { response: `improved:${String((inputs.messages as { content: string }[] | undefined)?.at(-1)?.content ?? "")}` };
  },
};

export default {
  fetch: (req: Request, env: Bindings, ctx: ExecutionContext) =>
    app.fetch(req, { ...env, AI: fakeAI }, ctx),
};
