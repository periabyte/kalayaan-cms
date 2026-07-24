# kalayaan-skill

An [agent skill](https://github.com/periabyte/kalayaan-cms) for deploying and managing a
[Kalayaan](https://github.com/periabyte/kalayaan-cms) project safely — scaffolding, editing
`cms.config.ts`, running `login`/`init`/`dev`/`migrate`/`deploy`, and driving content through the
admin or MCP APIs, with the same dry-run-first / no-silent-`--allow-destructive` guardrails a human
operator should follow.

This package's only file is `SKILL.md`, meant to be installed into an agent's skills directory
(e.g. Claude Code's `.claude/skills/`). See the
[main project README](https://github.com/periabyte/kalayaan-cms#readme) for what Kalayaan is.
