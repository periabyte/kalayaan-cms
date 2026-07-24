# @kalayaan/adapter-conformance

A shared test suite for [Kalayaan](https://github.com/periabyte/kalayaan-cms)
`DatabaseAdapter` implementations. Run it against a new adapter to verify it satisfies the same
query DSL, migration, and RBAC-storage behavior as the built-in D1/Postgres/MySQL adapters.

Intended for adapter authors, not typical CMS projects.

See [`docs/development-plan.md`](https://github.com/periabyte/kalayaan-cms/blob/main/docs/development-plan.md)
for the adapter contract this suite verifies.
