# @kalayaan/config

Config-time building blocks for a [Kalayaan](https://github.com/periabyte/kalayaan-cms) CMS:
`defineConfig`, `collection`, and `field` builders, Zod validation, role/permission definitions,
and schema snapshot + diffing (used by `kalayaan migrate`).

This is what a project's `cms.config.ts` is written against — most people get it transitively via
the [`kalayaan`](https://www.npmjs.com/package/kalayaan) package rather than installing it
directly.

## Usage

```ts
import { defineConfig, collection, field } from "@kalayaan/config";

export default defineConfig({
  name: "my-site",
  collections: [
    collection("posts", {
      fields: {
        title: field.text({ required: true }),
        slug: field.slug({ from: "title", unique: true }),
        body: field.richText(),
        status: field.select(["draft", "published"], { default: "draft" }),
      },
    }),
  ],
});
```

Full schema reference: [kalayaan.periabyte.dev](https://kalayaan.periabyte.dev/).
