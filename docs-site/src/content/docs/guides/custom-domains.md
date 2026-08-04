---
title: Custom domains
description: "Serve your Kalayaan CMS site on your own domain instead of *.workers.dev — DNS records and TLS certificates are provisioned automatically."
# Sidebar label and page H1 stay short (title above); this overrides just
# the <title> tag, which leads with the category for search. Starlight
# merges frontmatter head last and dedupes by tag, so this replaces its
# default `<title>` rather than adding a second one.
head:
  - tag: title
    content: "Attach a Custom Domain with Automatic DNS & TLS | Kalayaan CMS"
---

By default, `kalayaan deploy` serves your site on a free `*.workers.dev` URL. To use your own
domain (e.g. `blog.example.com`), set it in config or pass a flag — no separate DNS/TLS setup
required.

## Prerequisite

The domain must already be a **zone in your Cloudflare account** — i.e. its nameservers point at
Cloudflare. Add the site once at [dash.cloudflare.com](https://dash.cloudflare.com) (Add a site →
follow the nameserver step). Kalayaan can't do this step for you, since it requires a change at your
domain registrar.

## Usage

In `cms.config.ts`:

```ts
export default defineConfig({
  name: "my-site",
  domain: "blog.example.com",            // or ["example.com", "www.example.com"]
  // …
});
```

or per-deploy, without touching config:

```sh
npx kalayaan deploy --domain blog.example.com
```

On deploy, Kalayaan attaches the domain to your Worker via Cloudflare's Workers Custom Domains
API — Cloudflare creates the proxied DNS record and provisions the TLS certificate automatically.
The step is:

- **idempotent** — re-deploying doesn't duplicate the attachment, and
- **best-effort** — if the domain isn't a Cloudflare zone yet, the deploy still succeeds on the
  `*.workers.dev` URL and prints guidance instead of failing outright.

`kalayaan login` requests the DNS + Workers Routes permissions this needs up front, so there's no
re-authentication step later. `kalayaan down` detaches the domain before deleting the Worker.

## Bonus: email sending

A custom domain is also what unlocks **Cloudflare Email Sending** for user invites — set
`email: { from: "hello@yourdomain.com" }` in your config, and `kalayaan deploy` onboards that
domain for Email Routing + Sending automatically (no separate `wrangler` step). It's best-effort,
same as the domain attach above: without a configured email provider, or if onboarding fails,
invites still work — they degrade to a copyable invite link you can send however you like.
