---
title: AI features
description: "Kalayaan CMS runs alt-text, translation, and editorial assist on Workers AI free tier — no API key. Semantic search via Vectorize is optional."
# Sidebar label and page H1 stay short (title above); this overrides just
# the <title> tag, which leads with the category for search. Starlight
# merges frontmatter head last and dedupes by tag, so this replaces its
# default `<title>` rather than adding a second one.
head:
  - tag: title
    content: "AI Alt-Text, Translation & Semantic Search with Workers AI | Kalayaan CMS"
---

Kalayaan's AI features run on Workers AI — no separate API key or third-party account to set up.
Turn them on in `cms.config.ts`:

```ts
export default defineConfig({
  // ...
  ai: {
    enabled: true,
    features: ["alt-text", "translate", "editorial-assist"],
  },
});
```

`features` picks which capabilities are active: `"alt-text"`, `"translate"`, `"editorial-assist"`,
and `"semantic-search"` (see the [free-tier note](#semantic-search-the-one-paid-feature) below —
this one is different from the rest).

## What each feature does

- **Alt-text** — generates alt text for uploaded media automatically.
- **Translate** — translates a document's content into another configured locale.
- **Editorial assist** — a family of per-field actions: improve writing, summarize, and generate an
  SEO title/description. Attach one to a specific field with `aiEnrich`:

  ```ts
  body: field.richText({
    aiEnrich: { action: "improve" },
  }),
  excerpt: field.text({
    aiEnrich: { action: "summarize", dependency: "body" },
  }),
  ```

  `dependency` names the field to read source text from (omit it to have the action rewrite the
  field in place). This renders as a small inline "Generate with AI" control right on that field in
  the admin editor — not a generic sidebar panel — so it's always obvious which part of the
  document an AI action affects.

## Semantic search (the one paid feature)

Turning on `"semantic-search"` adds a public search endpoint:

```
GET /api/v1/search?q=<query>&collection=<name>&locale=<locale>&limit=20
```

Only `q` is required. Semantic search needs **Vectorize**, which is on Cloudflare's paid Workers
plan — everything else in Kalayaan runs on the permanent free tier. To keep the free path free by
default:

- `kalayaan doctor` and `kalayaan deploy` print a heads-up the moment `semantic-search` is enabled,
  so you always know before you deploy.
- Without Vectorize, `/api/v1/search` still works — it falls back to a plain SQL text-match scan,
  just without semantic ranking.

## Choosing models

Each capability runs on a specific Workers AI model, with a sane default for each — you don't need
to pick one to get started. To override any of them, add a `models` block:

```ts
ai: {
  enabled: true,
  features: ["editorial-assist"],
  models: {
    text: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", // improve/summarize/seo — bigger, higher quality
  },
},
```

| Key | Used for | Default |
|---|---|---|
| `text` | improve, summarize, SEO title/description | `@cf/meta/llama-3.1-8b-instruct-fast` |
| `vision` | alt-text generation | `@cf/meta/llama-3.2-11b-vision-instruct` |
| `translate` | the translate action | `@cf/meta/m2m100-1.2b` |
| `embed` | semantic search | `@cf/baai/bge-m3` |

Any key you omit falls back to the default — so `models: { text: "..." }` only changes the text
model and leaves the rest alone. Pick a bigger model (like `llama-3.3-70b-instruct-fp8-fast`) for
higher-quality writing help, or a smaller one to spend fewer neurons.

Cloudflare periodically deprecates older model versions — check the
[Workers AI model catalog](https://developers.cloudflare.com/workers-ai/models/) if a request
starts failing. Kalayaan's own defaults are updated when that happens, so staying on the default
(by omitting `models` entirely) is the lowest-maintenance choice.

**`embed` is special:** if you override it, you must also set `embedDimensions` to that model's
output size, since the Vectorize index is provisioned with that exact dimension:

```ts
models: {
  embed: "@cf/baai/bge-large-en-v1.5",
  embedDimensions: 1024,
},
```

## No AI features enabled?

Everything above is opt-in — leave `ai` unset (or `enabled: false`) and none of it runs. The rest
of Kalayaan (content modeling, roles, media, deployment) needs no AI configuration at all.
