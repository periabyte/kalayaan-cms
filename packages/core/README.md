# @kalayaan/core

Shared contracts for [Kalayaan](https://github.com/periabyte/kalayaan-cms): the query DSL types,
the `DatabaseAdapter` / `StorageAdapter` / `AIProvider` / `EmailProvider` interfaces, the `Ability`
RBAC model, `EdgeCMSError`, and small shared helpers (ulid, slug).

You'd depend on this directly if you're writing a new database/storage adapter or AI/email
provider; a typical Kalayaan project doesn't need it as a direct dependency.

See [`docs/development-plan.md`](https://github.com/periabyte/kalayaan-cms/blob/main/docs/development-plan.md)
for the adapter/provider architecture, and `@kalayaan/adapter-conformance` for the test suite new
adapters should pass.
