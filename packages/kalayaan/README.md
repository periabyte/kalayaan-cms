# kalayaan

A config-driven, self-deploying headless CMS for Cloudflare. Define your content in one
`cms.config.ts`, run a short guided setup (`login → init → deploy`), and get a live site on your
own domain — running free on Cloudflare's Workers, D1, R2, and KV.

This is the umbrella package: installing `kalayaan` gets you the CLI plus everything a scaffolded
site needs at runtime (config, runtime, adapters).

## Quickstart

```sh
npx kalayaan login          # one-time Cloudflare sign-in (guided token, auto account discovery)
npx kalayaan init my-site   # guided wizard: content models, services, domain — can deploy at the end
cd my-site
npm install
npx kalayaan dev            # runs locally under workerd, no Cloudflare account needed
```

```sh
npx kalayaan deploy                              # → https://my-site.<you>.workers.dev
npx kalayaan deploy --domain blog.example.com    # attach your own domain (DNS + TLS automatic)
```

## Defining a schema

```ts
import { defineConfig, collection, field } from "kalayaan";

export default defineConfig({
  name: "my-site",
  collections: [
    collection("posts", {
      fields: {
        title: field.text({ required: true }),
        slug: field.slug({ from: "title", unique: true }),
        body: field.richText(),
        status: field.select(["draft", "published"], { default: "draft" }),
      },
    }),
  ],
});
```

## CLI commands

| Command | What it does |
|---|---|
| `kalayaan login` / `logout` | Guided Cloudflare sign-in → `~/.kalayaan/credentials.json` |
| `kalayaan init [dir]` | Guided setup wizard → scaffolds `cms.config.ts` + `package.json` |
| `kalayaan dev [--host]` | Run locally under workerd with local D1/R2/KV |
| `kalayaan migrate [--dry-run] [--allow-destructive]` | Diff the schema and apply migrations |
| `kalayaan deploy [--domain <host>]` | Provision + deploy to Cloudflare; attach a custom domain |
| `kalayaan doctor` | Validate config, credentials, wrangler, free-tier posture |
| `kalayaan down [--yes]` | Detach domains and delete the deployed Worker + all resources |

## Docs

Full docs, feature list, and monorepo layout: [github.com/periabyte/kalayaan-cms](https://github.com/periabyte/kalayaan-cms)
· [kalayaan.periabyte.dev](https://kalayaan.periabyte.dev/)
