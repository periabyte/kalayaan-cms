---
"kalayaan": minor
"@kalayaan/config": minor
"@kalayaan/runtime": minor
"@kalayaan/cli": minor
"@kalayaan/adapter-relational": minor
"@kalayaan/adapter-d1": minor
"@kalayaan/adapter-postgres": minor
"@kalayaan/adapter-mysql": minor
"@kalayaan/admin": minor
---

Media fields, singleton collections, and a `kalayaan update` command.

- **Media fields — multiple + typed.** `field.media()` now takes `many: true` for
  an ordered gallery/attachments field (stored in a `<collection>_<field>` join
  table referencing `media`, ordered by `sort`) and `accept: ["image" | "video" |
  "file"]` to restrict what a field accepts. The admin media picker filters by kind,
  supports multi-select with reordering, and shows non-image assets; GraphQL types a
  many-media field as an ordered id list.
- **Singleton collections.** `collection(name, { singleton: true })` models single-page
  content (About, Home, Contact): exactly one entry per locale, edited directly with no
  list or "new entry", localization and versioning still apply. Enforced at the API
  layer (a second create returns 409) with no extra DDL.
- **`kalayaan update`.** Updates a project's Kalayaan dependencies to the latest release
  (or `--to <version>`): detects the package manager, bumps `kalayaan` + any `@kalayaan/*`
  packages, installs, and surfaces any pending schema migration so you know when a
  `migrate` + redeploy is due. Supports `--dry-run`, `--no-install`, and `--yes`.
