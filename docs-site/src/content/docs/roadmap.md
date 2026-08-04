---
title: Roadmap
description: "What is planned but not yet built in Kalayaan CMS, grouped by area — so you know what to expect before you rely on it."
# Sidebar label and page H1 stay short (title above); this overrides just
# the <title> tag, which leads with the category for search. Starlight
# merges frontmatter head last and dedupes by tag, so this replaces its
# default `<title>` rather than adding a second one.
head:
  - tag: title
    content: "Roadmap — What Is Planned Next | Kalayaan CMS"
---

Kalayaan already covers the full path from `cms.config.ts` to a live site on your own Cloudflare
account — content modelling, drafts and versioning, media, roles and access, localization, AI
features, GraphQL, an MCP server, and a [plugin/module extension seam](/guides/plugins-and-modules)
for business-specific routes and self-contained features. This page tracks what's **planned but not
yet built**, so you know what to expect before you rely on it.

It reflects the current state of [`main`](https://github.com/periabyte/kalayaan-cms). Have a request
or want to help? [Open an issue](https://github.com/periabyte/kalayaan-cms/issues).

## Content & editorial

- **Image transformations** — on-the-fly resize, crop, and format conversion when serving media
  (via Cloudflare's `/cdn-cgi/image`). Today media is served as the original stored file.
- **Direct-to-R2 (presigned) uploads** — upload large files straight to storage instead of
  streaming them through the Worker. Uploads are currently Worker-proxied, which is simple and free
  but caps practical file size.
- **Reliable webhook delivery** — a Queue-backed dispatcher with automatic retries and a
  dead-letter queue. Webhooks currently fire best-effort in the background, with no retry on failure.
- **Front-end preview** — shareable preview links that render an unpublished draft on your site.
  The editor's Preview button is a placeholder for now.

## Databases & storage

- **Run entirely off an external database** — Postgres and MySQL adapters exist for your *content*,
  but the system tables (users, media, versions) still require D1. Moving those stores behind the
  adapter would let a full CMS run on Postgres or MySQL alone.
- **MongoDB adapter** — a document-database adapter (native mapping, `$lookup`-based relations,
  schema-as-validators migrations).
- **Postgres/MySQL conformance in CI** — the adapter conformance suite runs against dockerized
  databases in CI so external-DB support is regression-tested on every change.

## AI

- **Alt-text review** — accept/reject chips for AI-suggested image alt text. Suggestions are
  currently generated and applied automatically.
- **AI Gateway routing** — route Workers AI calls through Cloudflare AI Gateway for caching, rate
  limiting, and usage analytics.
- **Smarter semantic search** — chunked embeddings for long documents, plus a backfill/reindex
  command to embed content that already exists. Search currently embeds each document once, on
  publish.

## Extensibility

- **A worked module example** — the [Plugins & modules](/guides/plugins-and-modules) guide covers
  the API with snippets, but there's no full example project (e.g. a small marketplace) showing a
  `Module`'s collections + routes + `PaymentProvider` wired together end-to-end.
- **Module-level config validation** — a module declaring its own config block (e.g. Stripe keys,
  fee percentages), validated at resolve time alongside the rest of `cms.config.ts`.
- **More than one payment provider per project** — today only the first registered module's
  `provides.payment` factory is used; later ones are silently ignored rather than erroring.

## Integrations & distribution

- **GraphQL mutations** — the GraphQL API is read-only today (queries resolve relations into nested
  objects); write operations are planned.
- **Streaming MCP** — Server-Sent Events for the MCP endpoint. It currently returns a single
  response per request (the stateless subset of the transport).
- **Cloudflare Access setup in the CLI** — the runtime already supports Cloudflare Access as an auth
  mode; `kalayaan init` and `kalayaan deploy` will gain prompts to configure and provision it.
- **Deploy-to-Cloudflare button** — one-click deploy of a starter project from the docs.

## Verification milestones

These are internal quality gates, each pending a dedicated CI job:

- **P3** — adapter conformance green on Postgres and MySQL in CI.
- **P4** — a nightly real-account smoke test for Workers AI and Vectorize.
- **P5** — a scripted `kalayaan-skill` agent run: empty directory to a deployed URL.

---

*Recently shipped:* business-specific plugin routes and custom RBAC subjects; the `Module` system
(build-time collections + a `PaymentProvider` seam) via `cms.modules.ts`; persistent, field-aware
dashboard columns; a branded project home page; per-locale editing; machine-translation review;
single-document relation population; and enforced custom field types. See the
[changelog](https://github.com/periabyte/kalayaan-cms/releases) for the full history.
