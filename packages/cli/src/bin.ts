#!/usr/bin/env node
import { join } from "node:path";
import { Command } from "commander";
import * as p from "@clack/prompts";
import { runDev } from "./commands/dev.js";
import { runMigrate } from "./commands/migrate.js";
import { runDeploy } from "./commands/deploy.js";
import { runInit, type DatabaseChoice, type Template } from "./commands/init.js";
import { runDoctor } from "./commands/doctor.js";
import { runUpdate } from "./commands/update.js";
import { runDown } from "./commands/down.js";
import { runLogin } from "./commands/login.js";
import { runLogout } from "./commands/logout.js";
import { bootstrapAdmin, waitForWorker } from "./admin-setup.js";

const program = new Command();
program.name("kalayaan").description("The CMS that deploys itself.");

program
  .command("init")
  .description("Guided setup: pick your content models, services, and domain")
  .argument("[dir]", "target directory", ".")
  .option("--name <name>", "project name")
  .option("--template <template>", "blog | portfolio | docs | blank")
  .option("--db <db>", "d1 | postgres | mysql | mongodb")
  .option("--collections <names>", "extra content models, comma-separated")
  .option("--ai", "enable AI features (default)")
  .option("--no-ai", "disable AI features")
  .option("--ai-features <list>", "AI features, comma-separated (defaults to the free set)")
  .option("--email-from <address>", "enable email invites from this address")
  .option("--domain <hostname>", "serve on a custom domain")
  .option("--submissions", "add a public submissions collection")
  .option("--deploy", "deploy immediately after scaffolding")
  .option("--yes", "skip prompts, use defaults/flags only (for CI and agents)")
  .action(
    async (
      dir: string,
      options: {
        name?: string;
        template?: string;
        db?: string;
        collections?: string;
        ai?: boolean;
        aiFeatures?: string;
        emailFrom?: string;
        domain?: string;
        submissions?: boolean;
        deploy?: boolean;
        yes?: boolean;
      },
    ) => {
      const { configPath } = await runInit({
        projectDir: join(process.cwd(), dir),
        ...(options.name && { name: options.name }),
        ...(options.template && { template: options.template as Template }),
        ...(options.db && { db: options.db as DatabaseChoice }),
        ...(options.collections && { collections: options.collections }),
        ...(options.ai !== undefined && { ai: options.ai }),
        ...(options.aiFeatures && { aiFeatures: options.aiFeatures }),
        ...(options.emailFrom && { emailFrom: options.emailFrom }),
        ...(options.domain && { domain: options.domain }),
        ...(options.submissions !== undefined && { submissions: options.submissions }),
        ...(options.deploy !== undefined && { deploy: options.deploy }),
        ...(options.yes !== undefined && { yes: options.yes }),
      });
      if (options.yes) console.log(`Created ${configPath}`);
    },
  );

program
  .command("dev")
  .description("Run the CMS locally under workerd with local D1/R2/KV simulation")
  .option("-p, --port <port>", "dev server port")
  .option(
    "--host <ip>",
    "network interface to bind (use 0.0.0.0 to reach it from other devices on your LAN)",
  )
  .action(async (options: { port?: string; host?: string }) => {
    await runDev({
      projectDir: process.cwd(),
      ...(options.port && { port: Number(options.port) }),
      ...(options.host && { host: options.host }),
    });
  });

program
  .command("migrate")
  .description("Apply pending schema migrations to the local D1 database")
  .option("--dry-run", "print the migration SQL without applying it")
  .option("--allow-destructive", "allow destructive schema changes (dropped fields/collections)")
  .action(async (options: { dryRun?: boolean; allowDestructive?: boolean }) => {
    const result = await runMigrate({
      projectDir: process.cwd(),
      ...(options.dryRun !== undefined && { dryRun: options.dryRun }),
      ...(options.allowDestructive !== undefined && { allowDestructive: options.allowDestructive }),
    });
    if (!result.changed) {
      console.log("Schema is up to date — nothing to migrate.");
      return;
    }
    if (options.dryRun) {
      console.log(result.sql);
      if (result.destructive) console.log("\n⚠ This migration includes destructive changes.");
      return;
    }
    console.log(result.applied ? "Migration applied." : "No migration applied.");
  });

program
  .command("deploy")
  .description("Provision Cloudflare resources and deploy the Worker")
  .option("--admin-email <email>", "create the root admin non-interactively (CI/agents)")
  .option("--admin-password <password>", "root admin password (or set EDGECMS_ADMIN_PASSWORD)")
  .option("--domain <hostname>", "serve on a custom domain (overrides config)")
  .action(async (options: { adminEmail?: string; adminPassword?: string; domain?: string }) => {
    const result = await runDeploy({
      projectDir: process.cwd(),
      ...(options.domain && { domain: options.domain }),
    });
    if (result.customDomains?.length)
      console.log(`\nYour site: ${result.customDomains.map((d) => `https://${d}`).join(", ")}`);
    console.log(`${result.customDomains?.length ? "Fallback: " : "\nDeployed: "}${result.url}`);
    if (result.migrationApplied) console.log("Schema migration applied.");
    for (const w of result.domainWarnings ?? []) console.log(`\n⚠ ${w}`);
    if (result.usesPaidFeatures)
      console.log(
        "\n⚠ semantic-search is enabled — it uses Vectorize, which requires the paid Workers plan. Remove it from ai.features to stay on the free tier.",
      );
    if (result.emailFrom && result.emailDomainOnboarded)
      console.log(`\n✉ Email invites use ${result.emailFrom} (domain onboarded for sending).`);
    if (result.emailWarning) console.log(`\n⚠ ${result.emailWarning}`);

    // Non-interactive bootstrap for CI/agents when both are supplied.
    const flagPassword = options.adminPassword ?? process.env.EDGECMS_ADMIN_PASSWORD;
    if (result.needsAdminSetup && options.adminEmail && flagPassword) {
      await bootstrapAdmin(result.url, { email: options.adminEmail, password: flagPassword });
      console.log(`\n✓ Root admin created: ${options.adminEmail}`);
      return;
    }

    if (result.needsAdminSetup) {
      // Wait for the workers.dev route to actually resolve, then point the
      // user at the one-time first-run setup screen in the browser.
      process.stdout.write("\nWaiting for the Worker to come online… ");
      const ready = await waitForWorker(result.url);
      console.log(ready ? "ready." : "still warming up (it may take a moment).");
      console.log(`\n▸ Create your admin account: ${result.url}/admin`);
    } else {
      console.log(`\nAdmin console: ${result.url}/admin`);
    }
  });

program
  .command("down")
  .description("Tear down this project's deployed Worker and Cloudflare resources")
  .option("--yes", "skip the confirmation prompt (for CI and agents)")
  .action(async (options: { yes?: boolean }) => {
    const projectDir = process.cwd();

    if (!options.yes) {
      if (!process.stdin.isTTY) {
        console.error("Refusing to tear down without --yes on a non-interactive terminal.");
        process.exitCode = 1;
        return;
      }
      p.intro("Tear down deployment");
      const preview = await runDown({ projectDir, dryRun: true });
      if (preview.resources.length === 0) {
        p.outro("Nothing deployed to tear down.");
        return;
      }
      p.log.warn(`This permanently deletes:\n${preview.resources.map((r) => `  • ${r}`).join("\n")}`);
      const confirmed = await p.confirm({ message: "Delete these resources? This cannot be undone.", initialValue: false });
      if (p.isCancel(confirmed) || !confirmed) {
        p.cancel("Aborted — nothing was deleted.");
        return;
      }
    }

    const result = await runDown({ projectDir });
    if (result.deleted.length === 0) console.log("Nothing to tear down.");
    else console.log(`Deleted:\n${result.deleted.map((r) => `  ✓ ${r}`).join("\n")}`);
    if (result.failed.length > 0)
      console.log(`\nCould not delete (may need manual cleanup):\n${result.failed.map((r) => `  ✗ ${r}`).join("\n")}`);
  });

program
  .command("login")
  .description("Sign in to Cloudflare (guided token creation — no env vars needed)")
  .option("--token <token>", "API token (non-interactive/CI)")
  .option("--account <id>", "account id when the token can reach more than one")
  .action(async (options: { token?: string; account?: string }) => {
    try {
      const result = await runLogin(options);
      if (!process.stdin.isTTY || options.token)
        console.log(`Signed in to "${result.accountName}" (${result.accountId}).`);
    } catch (err) {
      if (err instanceof Error && err.message === "cancelled") return;
      throw err;
    }
  });

program
  .command("logout")
  .description("Remove stored Cloudflare credentials")
  .action(async () => {
    const had = await runLogout();
    console.log(had ? "Signed out." : "You weren't signed in.");
  });

program
  .command("doctor")
  .description("Validate config, wrangler, Cloudflare credentials, and migration state")
  .action(async () => {
    const checks = await runDoctor(process.cwd());
    for (const check of checks) {
      const icon = check.status === "ok" ? "✓" : check.status === "warn" ? "⚠" : "✗";
      console.log(`${icon} ${check.name}: ${check.message}`);
    }
    if (checks.some((c) => c.status === "fail")) process.exitCode = 1;
  });

program
  .command("update")
  .description("Update this project's Kalayaan dependencies to the latest release")
  .option("--to <version>", "target a specific version instead of the latest")
  .option("--dry-run", "show what would change without modifying anything")
  .option("--no-install", "edit package.json but skip the package-manager install")
  .option("--yes", "skip the confirmation prompt (for CI and agents)")
  .action(async (options: { to?: string; dryRun?: boolean; install?: boolean; yes?: boolean }) => {
    const projectDir = process.cwd();

    // Preview first so we can show the plan and confirm before writing anything.
    const preview = await runUpdate({
      projectDir,
      dryRun: true,
      ...(options.to && { to: options.to }),
    });

    if (!preview.changed) {
      console.log(`Already on Kalayaan ${preview.targetVersion} — nothing to update.`);
      return;
    }

    const label = preview.installedVersion ?? "not installed";
    console.log(`Update Kalayaan: ${label} → ${preview.targetVersion}`);
    for (const u of preview.updates) console.log(`  • ${u.name}: ${u.from} → ${u.to}`);
    if (options.dryRun) return;

    if (!options.yes) {
      if (!process.stdin.isTTY) {
        console.error("Refusing to update without --yes on a non-interactive terminal.");
        process.exitCode = 1;
        return;
      }
      const ok = await p.confirm({ message: `Update to ${preview.targetVersion} and install?`, initialValue: true });
      if (p.isCancel(ok) || !ok) {
        p.cancel("Aborted — nothing was changed.");
        return;
      }
    }

    const result = await runUpdate({
      projectDir,
      to: preview.targetVersion,
      ...(options.install === false && { install: false }),
    });

    if (result.installed) console.log(`\n✓ Installed Kalayaan ${result.targetVersion} with ${result.packageManager}.`);
    else console.log(`\n✓ Updated package.json to Kalayaan ${result.targetVersion}. Run \`${result.packageManager} install\`.`);

    if (result.pendingMigration && result.pendingMigration.statements > 0) {
      const d = result.pendingMigration.destructive ? " (includes destructive changes)" : "";
      console.log(
        `\n⚠ ${result.pendingMigration.statements} pending schema change(s)${d}.\n  Next: kalayaan migrate${result.pendingMigration.destructive ? " --allow-destructive" : ""}  →  kalayaan deploy`,
      );
    } else {
      console.log("\nNext: redeploy with `kalayaan deploy` to run the new version.");
    }
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
