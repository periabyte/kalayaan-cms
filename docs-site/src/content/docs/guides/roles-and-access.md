---
title: Roles & access
description: "Config-defined roles and permissions in Kalayaan CMS, plus scoped API tokens with expiry, revocation, an audit log, and public/anonymous access."
# Sidebar label and page H1 stay short (title above); this overrides just
# the <title> tag, which leads with the category for search. Starlight
# merges frontmatter head last and dedupes by tag, so this replaces its
# default `<title>` rather than adding a second one.
head:
  - tag: title
    content: "Role-Based Access Control & Scoped API Tokens | Kalayaan CMS"
---

Every request in Kalayaan — whether it's a logged-in editor, an API key, or an anonymous visitor —
resolves to an **Ability**: a list of permission grants of the shape
`{ subjects: string[] | "*", actions: [...] }`. Actions are `read`, `create`, `update`, `delete`,
`publish`, and `manage`; subjects are collection names, or fixed system subjects (`media`,
`webhooks`, `users`, `api_keys`, `settings`, `ai`).

## Built-in roles

Four roles exist by default, with no config required:

- **`admin`** — superuser, every action on every subject.
- **`editor`** — full content CRUD + publish, media CRUD, read-only on `ai`.
- **`viewer`** — read-only on content and media.
- **`public`** — read-only on all collections. This is the ability applied to **unauthenticated**
  requests — see [public submissions](#public--anonymous-access) below.

## Defining custom roles

Add a `roles` block to `defineConfig`:

```ts
export default defineConfig({
  // ...
  roles: {
    contributor: {
      label: "Contributor",
      permissions: [
        { subjects: ["posts"], actions: ["read", "create", "update"] },
      ],
    },
  },
});
```

Omit `roles` entirely and the four built-ins apply as-is. `admin` always exists, even if you don't
declare it.

## Scoped API tokens

Create one from the admin API (`POST /api-keys`, gated on `manage` for `api_keys`):

```json
{
  "name": "publishing bot",
  "grants": [{ "subjects": ["posts", "authors"], "actions": ["read", "publish"] }],
  "expiresAt": 1735689600000
}
```

Tokens can be scoped as precisely as a role (`grants`), or coarser via legacy `scopes` +
`collections`. They support an optional expiry and can be revoked (`POST
/api-keys/:id/revoke`) or deleted outright — both are checked on every lookup. The raw key is shown
once, at creation; only its hash is stored.

## Public / anonymous access

Granting `create` on a collection to the `public` role turns on **anonymous submissions** for it —
useful for things like a public contact form or comment box that lands as an unpublished draft for
an editor to review. Two things protect it by default:

- **Cloudflare Turnstile** — the endpoint 403s until a `TURNSTILE_SECRET` is configured.
- **Per-IP rate limiting** — a small fixed window via KV, independent of Turnstile.

Submissions always land as drafts; anything trying to set its own `published_at` is rejected. See
`kalayaan init`'s wizard for turning this on when scaffolding a project.
