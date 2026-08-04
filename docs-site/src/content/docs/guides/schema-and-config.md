---
title: Schema & config
description: "Define collections, fields, and relations in one typed cms.config.ts — Kalayaan CMS derives the admin UI, REST/GraphQL APIs, and DB schema from it."
# Sidebar label and page H1 stay short (title above); this overrides just
# the <title> tag, which leads with the category for search. Starlight
# merges frontmatter head last and dedupes by tag, so this replaces its
# default `<title>` rather than adding a second one.
head:
  - tag: title
    content: "Config-Driven Content Schemas in TypeScript (cms.config.ts) | Kalayaan CMS"
---

Everything — the admin UI, the REST/GraphQL APIs, and the database schema — is derived from a
single `cms.config.ts`. There's no separate schema migration tool to learn and no admin UI to
click through to define a content type.

## A minimal example

```ts
import { defineConfig, collection, field } from "kalayaan";

export default defineConfig({
  name: "my-site",
  domain: "blog.example.com",                                   // custom domain (optional)
  ai: { enabled: true, features: ["alt-text", "translate", "editorial-assist"] },
  email: { from: "hello@yourdomain.com" },                      // email invites (optional)
  collections: [
    collection("posts", {
      fields: {
        title: field.text({ required: true }),
        slug: field.slug({ from: "title", unique: true }),
        body: field.richText(),
        cover: field.media(),
        author: field.relation("authors"),
        tags: field.relation("tags", { many: true }),
        status: field.select(["draft", "published"], { default: "draft" }),
      },
      versioning: true,
      localization: ["en", "de"],
    }),
    collection("authors", {
      fields: { name: field.text({ required: true }), avatar: field.media() },
    }),
  ],
});
```

## Field types

`field.*` covers the common content-modeling primitives: `text`, `slug` (derived from another
field, with uniqueness), `richText` (TipTap-backed, rendered in the admin editor), `media`
(R2/S3-backed uploads), `relation` (single or `many`, to another collection), `select`, `number`,
`boolean`, and `date`. Plugins can also register **custom field types** — see
`examples/blog/cms.plugins.ts` for a worked example (a `hex`-color field with its own validator and
control hint).

## Collection options

- **`versioning: true`** — every save is recorded to an append-only version history, with restore.
- **`localization: [...]`** — the collection gets true per-locale editing: each locale is a linked
  variant with its own independent publish state.
- **`aiEnrich`** on a field (e.g. `{ action: "improve", dependency: "body" }`) attaches an inline
  AI action button to that specific field in the editor — see the
  [AI features guide](/guides/ai-features/).

## Applying changes

Editing `cms.config.ts` doesn't hot-reload the schema — the Worker bundles your config at build
time, and the database schema is a separate, explicit step:

```sh
npx kalayaan migrate               # diffs your config against the last applied schema
npx kalayaan migrate --dry-run     # preview the SQL without applying it
npx kalayaan migrate --allow-destructive   # required for anything that could drop/alter data
```

`kalayaan deploy` runs the pending migration for you as part of the deploy, but reviewing a
`--dry-run` first (especially for destructive changes) is worth the ten seconds it takes.
