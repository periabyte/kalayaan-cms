import {
  collection,
  defineConfig,
  diffSnapshots,
  field,
  resolveConfig,
  snapshotOf,
  type EdgeCMSConfig,
} from "@kalayaan/config";

export function testConfig(): EdgeCMSConfig {
  return defineConfig({
    name: "test-site",
    // `translate` is intentionally omitted so tests can exercise the
    // "feature disabled → 404" gate on the translate route.
    ai: { enabled: true, features: ["alt-text", "editorial-assist"] },
    graphql: true,
    collections: [
      collection("posts", {
        fields: {
          title: field.text({ required: true }),
          slug: field.slug({ from: "title", unique: true }),
          body: field.richText(),
          author: field.relation("authors"),
          status: field.select(["draft", "published"], { default: "draft" }),
          views: field.number({ integer: true, default: 0 }),
          cover: field.media({ accept: ["image"] }),
          gallery: field.media({ many: true }),
        },
      }),
      collection("authors", { fields: { name: field.text({ required: true }) } }),
      // Single-page (singleton) collection: exactly one entry, edited directly.
      collection("about", {
        singleton: true,
        fields: { heading: field.text({ required: true }), body: field.richText() },
      }),
      // Localized collection with a plugin-contributed custom field type,
      // exercising per-locale editing, the mt-review write path, and custom
      // field validation. The `hex` validator is registered in worker.ts.
      collection("pages", {
        fields: {
          title: field.text({ required: true }),
          body: field.richText(),
          badge: field.custom("hex", { control: "text" }),
        },
        localization: ["en", "de"],
      }),
    ],
  });
}

export function testResolved() {
  return resolveConfig(testConfig());
}

export function testSnapshot() {
  return snapshotOf(testResolved());
}

export function testDiff() {
  return diffSnapshots(null, testSnapshot());
}
