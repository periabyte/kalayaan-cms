import { describe, expect, it } from "vitest";
import { generateEntrySource } from "../src/entry-template.js";

describe("generateEntrySource", () => {
  it("imports the config path, resolves it, and exports a fetch handler", () => {
    const src = generateEntrySource("./config.generated.mjs");
    expect(src).toContain('import userConfig from "./config.generated.mjs"');
    // Imports only from "kalayaan" (the umbrella package), never the
    // scoped @kalayaan/* packages directly — see entry-template.ts for why.
    expect(src).toContain('from "kalayaan"');
    expect(src).not.toContain("@kalayaan/");
    expect(src).toContain("resolveConfig(userConfig)");
    expect(src).toContain("export default {");
    expect(src).toContain("fetch:");
  });

  it("embeds the exact given import path (JSON-escaped, so special characters stay valid)", () => {
    const src = generateEntrySource("../weird path/config.mjs");
    expect(src).toContain(JSON.stringify("../weird path/config.mjs"));
  });

  it("imports NO external adapter for a D1 project (keeps mysql2/postgres out of the bundle)", () => {
    const src = generateEntrySource("./config.generated.mjs", "d1");
    expect(src).not.toContain("kalayaan/postgres");
    expect(src).not.toContain("kalayaan/mysql");
    expect(src).toContain("createApp(resolved, snapshot)");
  });

  it("wires the Postgres adapter factory only for a Postgres project", () => {
    const src = generateEntrySource("./config.generated.mjs", "postgres");
    expect(src).toContain('import { postgresAdapter } from "kalayaan/postgres"');
    expect(src).toContain("createApp(resolved, snapshot, { databaseAdapter: postgresAdapter })");
    expect(src).not.toContain("kalayaan/mysql");
  });

  it("wires the MySQL adapter factory only for a MySQL project", () => {
    const src = generateEntrySource("./config.generated.mjs", "mysql");
    expect(src).toContain('import { mysqlAdapter } from "kalayaan/mysql"');
    expect(src).toContain("createApp(resolved, snapshot, { databaseAdapter: mysqlAdapter })");
  });

  it("imports and passes project plugins when a plugins module is present", () => {
    const src = generateEntrySource("./config.generated.mjs", "d1", "./plugins.generated.mjs");
    expect(src).toContain('import plugins from "./plugins.generated.mjs"');
    expect(src).toContain("createApp(resolved, snapshot, { plugins })");
  });

  it("threads plugin-declared custom subjects into resolveConfig, so a role granting one doesn't 500 the deployed Worker", () => {
    const withPlugins = generateEntrySource("./config.generated.mjs", "d1", "./plugins.generated.mjs");
    expect(withPlugins).toContain("PluginHost");
    expect(withPlugins).toContain("resolveConfig(userConfig, { extraSubjects: new PluginHost(plugins).subjects() })");

    // No plugins module: resolveConfig call stays exactly as before, no PluginHost import.
    const noPlugins = generateEntrySource("./config.generated.mjs");
    expect(noPlugins).not.toContain("PluginHost");
    expect(noPlugins).toContain("resolveConfig(userConfig)");
  });

  it("passes both the adapter factory and plugins together", () => {
    const src = generateEntrySource("./config.generated.mjs", "postgres", "./plugins.generated.mjs");
    expect(src).toContain("createApp(resolved, snapshot, { databaseAdapter: postgresAdapter, plugins })");
  });

  it("imports and passes project modules when a modules file is present", () => {
    const src = generateEntrySource("./config.generated.mjs", "d1", undefined, "./modules.generated.mjs");
    expect(src).toContain('import modules from "./modules.generated.mjs"');
    expect(src).toContain("createApp(resolved, snapshot, { modules })");
    expect(src).toContain("resolveConfig(userConfig, { extraSubjects: new PluginHost(modules).subjects() })");
  });

  it("combines plugins and modules into one PluginHost for extraSubjects, and passes both to createApp", () => {
    const src = generateEntrySource(
      "./config.generated.mjs",
      "d1",
      "./plugins.generated.mjs",
      "./modules.generated.mjs",
    );
    expect(src).toContain('import plugins from "./plugins.generated.mjs"');
    expect(src).toContain('import modules from "./modules.generated.mjs"');
    expect(src).toContain("createApp(resolved, snapshot, { plugins, modules })");
    expect(src).toContain(
      "resolveConfig(userConfig, { extraSubjects: new PluginHost([...plugins, ...modules]).subjects() })",
    );
  });
});
