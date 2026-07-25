---
"kalayaan": minor
"@kalayaan/config": minor
"@kalayaan/runtime": minor
"@kalayaan/cli": minor
"@kalayaan/core": minor
"@kalayaan/adapter-relational": minor
"@kalayaan/adapter-d1": minor
"@kalayaan/adapter-postgres": minor
"@kalayaan/adapter-mysql": minor
"@kalayaan/admin": minor
---

Related-field population, media-upload API keys, and Kalayaan-branded auth identifiers.

- **Populate related fields on single-document reads.** `GET /api/v1/:collection/:idOrSlug?populate=author,cover`
  (and the admin single-GET) now resolve relation and media fields into nested objects — previously
  only list endpoints supported `?populate=`. Threaded via a new `populate` on `DocRef` reusing the
  adapter's existing batched hydration.
- **GraphQL resolves relations and media as nested objects.** A `relation` field now resolves to the
  target collection's object type (`author { name }`) and a `media` field to a new `Media` type
  (`id`, `url`, `filename`, `mime`, `size`, `width`, `height`, `alt`), single or list. The resolver
  populates exactly the fields the query selects (depth 1, batched — no N+1).
  **Breaking (GraphQL):** relation/media fields used to return a raw id string; a query selecting one
  as a scalar (`{ posts { author } }`) must now select subfields (`author { id }`).
- **API keys can be scoped to the media library.** The key-creation form adds a "Media library"
  option, so you can mint a token that uploads/manages media (`create` on the `media` subject)
  without granting full `manage` over every system area. `subjects: "*"` still matches collections
  only, so media gets its own grant.
- **Rebranded auth identifiers.** Generated API tokens now use the `kcms_` prefix (was `ecms_`), and
  the session/CSRF cookies are `kalayaan_session` / `kalayaan_csrf` (were `edgecms_*`). Existing API
  keys keep working (validated by hash); active sessions are logged out once and sign back in.
