# @kalayaan/adapter-mysql

MySQL storage adapter for [Kalayaan](https://github.com/periabyte/kalayaan-cms) — implements the
`@kalayaan/core` storage contract for a self-hosted or managed MySQL database, built on the shared
SQL query builder in `@kalayaan/adapter-relational`.

Requires the `mysql2` peer dependency. Use this when hosting Kalayaan against your own MySQL instance
instead of Cloudflare D1.
