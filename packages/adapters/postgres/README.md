# @kalayaan/adapter-postgres

PostgreSQL storage adapter for [Kalayaan](https://github.com/periabyte/kalayaan-cms) — implements the
`@kalayaan/core` storage contract for a self-hosted or managed Postgres database, built on the shared
SQL query builder in `@kalayaan/adapter-relational`.

Requires the `postgres` peer dependency. Use this when hosting Kalayaan against your own Postgres
instance instead of Cloudflare D1.
