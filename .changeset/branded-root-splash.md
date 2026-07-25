---
"@kalayaan/runtime": patch
---

Redesign the API root (`/`) as a branded, headless splash.

Browser navigations to `/` now render a single branded page (the "Dawn" theme, with the Cubao Free
display face served locally via the Assets binding) with one call-to-action to the project site,
instead of listing the Admin / REST / GraphQL / MCP entry points. The page no longer exposes internal
route paths; the JSON 404 for non-HTML clients is unchanged.
