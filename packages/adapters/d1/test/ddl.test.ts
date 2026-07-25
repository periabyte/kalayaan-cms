import { describe, expect, it } from "vitest";
import { collection, field } from "@kalayaan/config";
import { blogConfig, ddlBetween } from "./helpers.js";

describe("emitDDL golden output", () => {
  it("initial migration for the blog schema", () => {
    const sql = ddlBetween(null, blogConfig())
      .map((s) => s.sql)
      .join("\n");
    expect(sql).toMatchSnapshot();
  });

  it("adding a plain field emits ALTER TABLE ADD COLUMN", () => {
    const next = blogConfig();
    (next.collections[0]!.fields as Record<string, unknown>).subtitle = field.text();
    const statements = ddlBetween(blogConfig(), next);
    expect(statements).toEqual([
      { sql: `ALTER TABLE "posts" ADD COLUMN "subtitle" TEXT;`, destructive: false },
    ]);
  });

  it("adding a unique field also creates a locale-aware unique index", () => {
    const next = blogConfig();
    (next.collections[0]!.fields as Record<string, unknown>).isbn = field.text({ unique: true });
    const statements = ddlBetween(blogConfig(), next).map((s) => s.sql);
    expect(statements).toEqual([
      `ALTER TABLE "posts" ADD COLUMN "isbn" TEXT;`,
      `CREATE UNIQUE INDEX "ux_posts_isbn" ON "posts" ("isbn", "locale");`,
    ]);
  });

  it("adding a custom field emits a plain TEXT column (like richText)", () => {
    const next = blogConfig();
    (next.collections[0]!.fields as Record<string, unknown>).brand_color = field.custom("hex", {
      control: "text",
    });
    const statements = ddlBetween(blogConfig(), next);
    expect(statements).toEqual([
      { sql: `ALTER TABLE "posts" ADD COLUMN "brand_color" TEXT;`, destructive: false },
    ]);
  });

  it("adding a many-relation only creates the join table", () => {
    const next = blogConfig();
    (next.collections[1]!.fields as Record<string, unknown>).interests = field.relation("tags", {
      many: true,
    });
    const statements = ddlBetween(blogConfig(), next).map((s) => s.sql);
    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain(`CREATE TABLE "authors_interests"`);
  });

  it("adding a many-media field only creates a join table referencing media", () => {
    const next = blogConfig();
    (next.collections[0]!.fields as Record<string, unknown>).shots = field.media({ many: true });
    const statements = ddlBetween(blogConfig(), next).map((s) => s.sql);
    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain(`CREATE TABLE "posts_shots"`);
    expect(statements[0]).toContain(`REFERENCES "media"("id") ON DELETE CASCADE`);
    expect(statements[0]).toContain(`"sort" INTEGER NOT NULL DEFAULT 0`);
  });

  it("adding a single media field emits an _id column + index (unchanged)", () => {
    const next = blogConfig();
    (next.collections[0]!.fields as Record<string, unknown>).hero = field.media({ accept: ["image"] });
    const statements = ddlBetween(blogConfig(), next).map((s) => s.sql);
    expect(statements[0]).toBe(
      `ALTER TABLE "posts" ADD COLUMN "hero_id" TEXT REFERENCES "media"("id") ON DELETE SET NULL;`,
    );
    expect(statements[1]).toContain(`CREATE INDEX "idx_posts_hero" ON "posts" ("hero_id")`);
  });

  it("switching a media field single→many drops the column and creates the join table", () => {
    const prev = blogConfig();
    (prev.collections[0]!.fields as Record<string, unknown>).hero = field.media();
    const next = blogConfig();
    (next.collections[0]!.fields as Record<string, unknown>).hero = field.media({ many: true });
    const sql = ddlBetween(prev, next)
      .map((s) => s.sql)
      .join("\n");
    // SQLite copy-rename drops the old hero_id column, and the join table is created.
    expect(sql).toContain(`CREATE TABLE "_new_posts"`);
    expect(sql).not.toContain(`"hero_id"`);
    expect(sql).toContain(`CREATE TABLE "posts_hero"`);
    expect(sql).toContain(`REFERENCES "media"("id") ON DELETE CASCADE`);
  });

  it("dropping a many-relation only drops the join table", () => {
    const next = blogConfig();
    delete (next.collections[0]!.fields as Record<string, unknown>).tags;
    const statements = ddlBetween(blogConfig(), next);
    expect(statements).toEqual([{ sql: `DROP TABLE "posts_tags";`, destructive: true }]);
  });

  it("dropping a column rebuilds via copy-rename, preserving shared columns", () => {
    const next = blogConfig();
    delete (next.collections[0]!.fields as Record<string, unknown>).body;
    const statements = ddlBetween(blogConfig(), next).map((s) => s.sql);
    const joined = statements.join("\n");
    expect(joined).toContain(`CREATE TABLE "_new_posts"`);
    expect(joined).toContain(`DROP TABLE "posts";`);
    expect(joined).toContain(`ALTER TABLE "_new_posts" RENAME TO "posts";`);
    // The INSERT copies every surviving column but not the dropped one.
    const insert = statements.find((s) => s.startsWith("INSERT"))!;
    expect(insert).toContain(`"title"`);
    expect(insert).not.toContain(`"body"`);
    // Unique + entity indexes are recreated after the rename.
    expect(joined).toContain(`CREATE UNIQUE INDEX "ux_posts_slug"`);
    expect(joined).toContain(`CREATE UNIQUE INDEX "ux_posts_entity_locale"`);
  });

  it("all rebuild statements inherit the destructive flag", () => {
    const next = blogConfig();
    delete (next.collections[0]!.fields as Record<string, unknown>).body;
    for (const s of ddlBetween(blogConfig(), next)) expect(s.destructive).toBe(true);
  });

  it("enabling localization on an existing collection rebuilds with locale columns", () => {
    const next = blogConfig();
    (next.collections[2] as { localization?: string[] }).localization = ["en", "de"];
    const statements = ddlBetween(blogConfig(), next).map((s) => s.sql);
    const create = statements.find((s) => s.startsWith(`CREATE TABLE "_new_tags"`))!;
    expect(create).toContain(`"entity_id" TEXT NOT NULL`);
    expect(create).toContain(`"locale" TEXT NOT NULL DEFAULT 'en'`);
    // Old table had no entity_id: it's backfilled from id; locale takes its DEFAULT.
    const insert = statements.find((s) => s.startsWith("INSERT"))!;
    expect(insert).toContain(`("id", "entity_id",`);
    expect(insert).toContain(`SELECT "id", "id",`);
    expect(insert).not.toContain(`"locale"`);
  });

  it("escapes quotes in identifiers and literals", () => {
    const statements = ddlBetween(null, {
      name: "x",
      collections: [
        collection("quotes", {
          fields: { kind: field.select(["it's", "plain"], { default: "plain" }) },
        }),
      ],
    }).map((s) => s.sql);
    expect(statements.join("\n")).toContain(`'it''s'`);
  });
});
