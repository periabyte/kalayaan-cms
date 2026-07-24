# @kalayaan/runtime

The Hono application that powers a deployed [Kalayaan](https://github.com/periabyte/kalayaan-cms)
site: the public content API (`/api/v1`), the admin API, auth + RBAC, media handling, AI features,
GraphQL (behind a flag), the MCP server (`/mcp`), and moderated public submissions.

The Worker built by `kalayaan deploy` bundles this at build time — config changes require a
migrate + redeploy, not a hot reload. Most projects consume it indirectly via the
[`kalayaan`](https://www.npmjs.com/package/kalayaan) CLI rather than importing it directly.

See [`docs/development-plan.md`](https://github.com/periabyte/kalayaan-cms/blob/main/docs/development-plan.md)
for the runtime architecture.
