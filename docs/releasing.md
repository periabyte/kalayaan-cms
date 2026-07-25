# Releasing

Publishing `@kalayaan/*` + `kalayaan` to npm is triggered by publishing a **GitHub Release** —
nothing publishes automatically on every merge to `main`. Versions are bumped manually first, so
you review the changelog before anything ships.

## One-time setup (do before the first release)

Publishing uses npm **Trusted Publishing** (OIDC) — `.github/workflows/release.yml` authenticates
via a short-lived token minted for that exact workflow run, no long-lived `NPM_TOKEN` secret
involved. Trusted publisher records only attach to packages that already exist, so the very first
release has a bootstrapping step:

1. **Claim the names**: publish once manually from your own machine (needs your npm login + an
   OTP from your authenticator): `npm login` then `pnpm changeset publish`. This is the only manual
   publish ever — every release after this goes through CI.
2. **Configure trusted publishers**: for every package (`kalayaan` + each `@kalayaan/*`), run:
   ```sh
   npm trust github <package> --repo periabyte/kalayaan-cms --file release.yml --allow-publish
   ```
   Each call opens a browser to approve via OIDC/2FA; check status any time with
   `npm trust list <package>`. `kalayaan-skill` is skipped — it's `private: true` and never
   published (so `changeset publish` doesn't try to). Every other `@kalayaan/*` package,
   including `@kalayaan/admin` (the admin SPA, shipped as a package so the CLI can serve it as
   Workers Assets), is published.
3. Make sure `main` is the default branch and has a git remote (`git remote -v`).

## Every release

All packages release in lockstep (`.changeset/config.json`'s `fixed` group), so they always share
one version number.

```sh
# 1. Turn pending changesets (added via `pnpm changeset` as features/fixes land)
#    into version bumps + CHANGELOG entries. Several may already be pending —
#    check with `ls .changeset/*.md`.
pnpm changeset version

# 2. Review the diff: package.json versions + CHANGELOG.md files.
git diff

# 3. Commit, tag, and push.
git add -A
git commit -m "chore: release vX.Y.Z"
git tag vX.Y.Z
git push origin main --tags

# 4. Cut the GitHub Release from that tag — THIS is what triggers the publish workflow.
gh release create vX.Y.Z --generate-notes
```

`gh release create` opens the release with auto-generated notes from commits/PRs since the last
tag — edit them in the prompt (or `--notes-file`) before confirming if you want custom wording.
Publishing the release fires `.github/workflows/release.yml`: build → typecheck → test →
`pnpm changeset publish`, which only pushes packages whose local version isn't already on npm
(safe to re-run if the release gets re-published or a step needs retrying).

## Verifying

```sh
npx kalayaan@latest --version
npm view kalayaan versions --json
```
