import type {
  FieldDef,
  SchemaChange,
  SchemaSnapshot,
  SnapshotCollection,
  SnapshotField,
} from "@kalayaan/config";
import { isDestructive } from "@kalayaan/config";
import { isManyField, joinTargetOf } from "./naming.js";

export interface SqlStatement {
  sql: string;
  destructive: boolean;
}

/**
 * The seam that lets one relational engine (query builder + DDL emitter +
 * CRUD) target SQLite/D1, Postgres, and MySQL. Everything that differs between
 * SQL dialects lives here; the shared code in `adapter.ts`, `query-builder.ts`,
 * and `ddl.ts` is engine-agnostic and defers to a `SqlDialect` instance.
 *
 * The canonical placeholder in generated SQL is always `?`; engines that need
 * a different form (Postgres `$1..$n`) rewrite it in `renderParams` at the
 * executor boundary. Generated SQL never embeds a literal `?` inside a string,
 * so positional rewriting is unambiguous.
 */
export interface SqlDialect {
  readonly id: "sqlite" | "postgres" | "mysql";

  /** Quote an identifier (column/table name). */
  quoteId(ident: string): string;
  /** Quote a string literal for inlining into DDL (defaults, CHECKs). */
  quoteLiteral(value: string): string;
  /** Rewrite `?` placeholders into the engine's form. Identity for `?`-engines. */
  renderParams(sql: string): string;
  /** Operator used to implement `contains` (Postgres prefers case-insensitive ILIKE). */
  readonly likeOperator: string;

  /** Encode a JS value for binding (e.g. boolean → 0/1 on SQLite, kept native on Postgres). */
  encodeParam(value: unknown): unknown;
  /** Decode a boolean column value read back from the engine. */
  decodeBoolean(value: unknown): boolean;

  // ---- DDL ----

  /** SQL type for integer timestamps (`INTEGER` on SQLite, `BIGINT` elsewhere). */
  readonly timestampType: string;
  /**
   * SQL type for identity/key text columns — id, entity_id, locale, and the
   * join-table owner/ref columns. `TEXT` on SQLite/Postgres; MySQL needs a
   * bounded `VARCHAR` since TEXT can't be a primary key or indexed unprefixed.
   */
  readonly idType: string;
  /** true → drop/alter columns with `ALTER TABLE`; false → SQLite copy-rename dance. */
  readonly supportsAlterColumn: boolean;
  /** Are DDL statements transactional? (Postgres yes; MySQL/D1 no.) */
  readonly ddlTransactional: boolean;
  /**
   * The full column definition line for a field — `"name" TYPE constraints…` —
   * or null for fields that own no column on the main table (many-relations).
   */
  columnDefinition(f: SnapshotField, opts: { freshTable: boolean }): string | null;
  /** DDL for the fixed system tables (`_migrations`, `_versions`, `media`, …). */
  systemTableDDL(): string[];
}

export function fieldDef(f: SnapshotField): FieldDef {
  return f.def as unknown as FieldDef;
}

/** DB column name for a field: single relations and media get an `_id` suffix. */
export function columnNameFor(f: SnapshotField): string {
  const def = fieldDef(f);
  if (def.type === "media" || (def.type === "relation" && !def.many)) return `${f.name}_id`;
  return f.name;
}

export function joinTableNameFor(collection: string, fieldName: string): string {
  return `${collection}_${fieldName}`;
}

/**
 * The dialect-agnostic DDL emitter. Shared shape (tables, indexes, join
 * tables, add-column) is generated the same way for every engine; the
 * destructive edits (`drop_field`, `alter_field`, `set_localization`) branch
 * on `dialect.supportsAlterColumn` — copy-rename on SQLite, `ALTER TABLE`
 * everywhere else.
 */
export function emitDDL(
  dialect: SqlDialect,
  changes: SchemaChange[],
  next: SchemaSnapshot,
  prev: SchemaSnapshot | null,
): SqlStatement[] {
  const statements: SqlStatement[] = [];
  const rebuilt = new Set<string>();
  const prevOf = (name: string) => prev?.collections.find((c) => c.name === name) ?? null;
  const q = (id: string) => dialect.quoteId(id);
  const join = (collection: string, field: string) => q(joinTableNameFor(collection, field));

  for (const change of changes) {
    const destructive = isDestructive(change);
    switch (change.kind) {
      case "create_collection":
        statements.push(
          ...createCollection(dialect, change.collection).map((sql) => ({ sql, destructive })),
        );
        break;

      case "drop_collection":
        statements.push({ sql: `DROP TABLE IF EXISTS ${q(change.name)};`, destructive });
        break;

      case "add_field": {
        if (rebuilt.has(change.collection)) break;
        const collection = mustFind(next, change.collection);
        statements.push(
          ...addField(dialect, collection, change.field).map((sql) => ({ sql, destructive })),
        );
        break;
      }

      case "drop_field": {
        if (rebuilt.has(change.collection)) break;
        const collection = mustFind(next, change.collection);
        const prevCollection = prevOf(change.collection);
        const dropped = prevCollection?.fields.find((f) => f.name === change.field);
        const droppedDef = dropped ? fieldDef(dropped) : null;
        const wasMany = droppedDef ? isManyField(droppedDef) : false;
        if (wasMany) {
          statements.push({ sql: `DROP TABLE ${join(change.collection, change.field)};`, destructive });
        } else if (dialect.supportsAlterColumn && dropped) {
          statements.push({
            sql: `ALTER TABLE ${q(change.collection)} DROP COLUMN ${q(columnNameFor(dropped))};`,
            destructive,
          });
        } else {
          statements.push(
            ...rebuildTable(dialect, collection, prevCollection).map((sql) => ({ sql, destructive })),
          );
          rebuilt.add(change.collection);
        }
        break;
      }

      case "alter_field": {
        if (rebuilt.has(change.collection)) break;
        const collection = mustFind(next, change.collection);
        const beforeMany = isManyField(fieldDef(change.before));
        const afterMany = isManyField(fieldDef(change.after));
        if (beforeMany && !afterMany) {
          statements.push({
            sql: `DROP TABLE IF EXISTS ${join(change.collection, change.after.name)};`,
            destructive,
          });
        }
        if (afterMany && !beforeMany) {
          statements.push({
            sql: createJoinTable(
              dialect,
              change.collection,
              change.after.name,
              joinTargetOf(fieldDef(change.after)),
            ),
            destructive,
          });
        }
        if (columnAffecting(change.before) || columnAffecting(change.after)) {
          if (dialect.supportsAlterColumn) {
            statements.push(
              ...alterColumn(dialect, collection, change.before, change.after).map((sql) => ({
                sql,
                destructive,
              })),
            );
          } else {
            statements.push(
              ...rebuildTable(dialect, collection, prevOf(change.collection)).map((sql) => ({
                sql,
                destructive,
              })),
            );
            rebuilt.add(change.collection);
          }
        }
        break;
      }

      case "set_localization": {
        if (rebuilt.has(change.collection)) break;
        const collection = mustFind(next, change.collection);
        if (dialect.supportsAlterColumn) {
          statements.push(
            ...setLocalization(dialect, collection, prevOf(change.collection)).map((sql) => ({
              sql,
              destructive,
            })),
          );
        } else {
          statements.push(
            ...rebuildTable(dialect, collection, prevOf(change.collection)).map((sql) => ({
              sql,
              destructive,
            })),
          );
          rebuilt.add(change.collection);
        }
        break;
      }
    }
  }

  return statements;
}

export function createCollection(dialect: SqlDialect, c: SnapshotCollection): string[] {
  const statements = [createTable(dialect, c, c.name)];
  for (const f of c.fields) {
    const def = fieldDef(f);
    if (isManyField(def))
      statements.push(createJoinTable(dialect, c.name, f.name, joinTargetOf(def)));
  }
  statements.push(...createIndexes(dialect, c, c.name));
  return statements;
}

function createTable(dialect: SqlDialect, c: SnapshotCollection, tableName: string): string {
  const q = (id: string) => dialect.quoteId(id);
  const localized = c.locales.length > 0;
  const cols: string[] = [`  ${q("id")} ${dialect.idType} PRIMARY KEY`];
  if (localized) {
    cols.push(`  ${q("entity_id")} ${dialect.idType} NOT NULL`);
    cols.push(`  ${q("locale")} ${dialect.idType} NOT NULL DEFAULT ${dialect.quoteLiteral(c.locales[0]!)}`);
  }
  for (const f of c.fields) {
    const col = dialect.columnDefinition(f, { freshTable: true });
    if (col) cols.push(`  ${col}`);
  }
  cols.push(`  ${q("created_at")} ${dialect.timestampType} NOT NULL`);
  cols.push(`  ${q("updated_at")} ${dialect.timestampType} NOT NULL`);
  cols.push(`  ${q("published_at")} ${dialect.timestampType}`);
  return `CREATE TABLE ${q(tableName)} (\n${cols.join(",\n")}\n);`;
}

function createIndexes(dialect: SqlDialect, c: SnapshotCollection, tableName: string): string[] {
  const q = (id: string) => dialect.quoteId(id);
  const localized = c.locales.length > 0;
  const out: string[] = [];
  if (localized) {
    out.push(
      `CREATE UNIQUE INDEX ${q(`ux_${c.name}_entity_locale`)} ON ${q(tableName)} (${q("entity_id")}, ${q("locale")});`,
    );
  }
  for (const f of c.fields) {
    const def = fieldDef(f);
    if ("unique" in def && def.unique) {
      const cols = localized ? `${q(columnNameFor(f))}, ${q("locale")}` : q(columnNameFor(f));
      out.push(`CREATE UNIQUE INDEX ${q(`ux_${c.name}_${f.name}`)} ON ${q(tableName)} (${cols});`);
    }
    if (!isManyField(def) && (def.type === "relation" || def.type === "media")) {
      out.push(
        `CREATE INDEX ${q(`idx_${c.name}_${f.name}`)} ON ${q(tableName)} (${q(columnNameFor(f))});`,
      );
    }
  }
  return out;
}

function addField(dialect: SqlDialect, c: SnapshotCollection, f: SnapshotField): string[] {
  const q = (id: string) => dialect.quoteId(id);
  const def = fieldDef(f);
  if (isManyField(def)) return [createJoinTable(dialect, c.name, f.name, joinTargetOf(def))];
  const col = dialect.columnDefinition(f, { freshTable: false });
  if (!col) return [];
  const out = [`ALTER TABLE ${q(c.name)} ADD COLUMN ${col};`];
  const localized = c.locales.length > 0;
  if ("unique" in def && def.unique) {
    const cols = localized ? `${q(columnNameFor(f))}, ${q("locale")}` : q(columnNameFor(f));
    out.push(`CREATE UNIQUE INDEX ${q(`ux_${c.name}_${f.name}`)} ON ${q(c.name)} (${cols});`);
  }
  if (!isManyField(def) && (def.type === "relation" || def.type === "media")) {
    out.push(
      `CREATE INDEX ${q(`idx_${c.name}_${f.name}`)} ON ${q(c.name)} (${q(columnNameFor(f))});`,
    );
  }
  return out;
}

/**
 * SQLite copy-rename: build the target-shaped table under a temp name, copy
 * columns shared with the previous shape (new columns get their defaults or
 * NULL), swap it in, and recreate indexes.
 */
function rebuildTable(
  dialect: SqlDialect,
  c: SnapshotCollection,
  prev: SnapshotCollection | null,
): string[] {
  const q = (id: string) => dialect.quoteId(id);
  const tmp = `_new_${c.name}`;
  const newCols = tableColumns(c);
  const oldCols = prev ? new Set(tableColumns(prev)) : new Set(newCols);
  const copies: { target: string; source: string }[] = [];
  for (const col of newCols) {
    if (oldCols.has(col)) copies.push({ target: col, source: q(col) });
    else if (col === "entity_id") copies.push({ target: col, source: q("id") });
  }
  const targets = copies.map((c2) => q(c2.target)).join(", ");
  const sources = copies.map((c2) => c2.source).join(", ");
  return [
    createTable(dialect, c, tmp),
    `INSERT INTO ${q(tmp)} (${targets}) SELECT ${sources} FROM ${q(c.name)};`,
    `DROP TABLE ${q(c.name)};`,
    `ALTER TABLE ${q(tmp)} RENAME TO ${q(c.name)};`,
    ...createIndexes(dialect, c, c.name),
  ];
}

/** ALTER-based column change for engines that support it (Postgres/MySQL). */
function alterColumn(
  dialect: SqlDialect,
  c: SnapshotCollection,
  before: SnapshotField,
  after: SnapshotField,
): string[] {
  const q = (id: string) => dialect.quoteId(id);
  const beforeMany = isManyField(fieldDef(before));
  const out: string[] = [];
  // Column added where none existed (single-relation gained from a many-relation).
  if (beforeMany && dialect.columnDefinition(after, { freshTable: false })) {
    out.push(`ALTER TABLE ${q(c.name)} ADD COLUMN ${dialect.columnDefinition(after, { freshTable: false })};`);
    return out;
  }
  // Rebuild the column in place: drop and re-add. Simple, portable, and honest
  // about being destructive (the ChangeSet already flags alter_field).
  const col = dialect.columnDefinition(after, { freshTable: false });
  if (!col) return out;
  out.push(`ALTER TABLE ${q(c.name)} DROP COLUMN ${q(columnNameFor(before))};`);
  out.push(`ALTER TABLE ${q(c.name)} ADD COLUMN ${col};`);
  return out;
}

/** ALTER-based localization switch: add entity_id/locale, backfill, reindex. */
function setLocalization(
  dialect: SqlDialect,
  c: SnapshotCollection,
  prev: SnapshotCollection | null,
): string[] {
  const q = (id: string) => dialect.quoteId(id);
  const nowLocalized = c.locales.length > 0;
  const wasLocalized = (prev?.locales.length ?? 0) > 0;
  const out: string[] = [];
  if (nowLocalized && !wasLocalized) {
    out.push(`ALTER TABLE ${q(c.name)} ADD COLUMN ${q("entity_id")} TEXT;`);
    out.push(
      `ALTER TABLE ${q(c.name)} ADD COLUMN ${q("locale")} TEXT NOT NULL DEFAULT ${dialect.quoteLiteral(c.locales[0]!)};`,
    );
    out.push(`UPDATE ${q(c.name)} SET ${q("entity_id")} = ${q("id")} WHERE ${q("entity_id")} IS NULL;`);
    out.push(...createIndexes(dialect, c, c.name));
  } else if (!nowLocalized && wasLocalized) {
    out.push(`ALTER TABLE ${q(c.name)} DROP COLUMN ${q("entity_id")};`);
    out.push(`ALTER TABLE ${q(c.name)} DROP COLUMN ${q("locale")};`);
    out.push(...createIndexes(dialect, c, c.name));
  }
  return out;
}

function tableColumns(c: SnapshotCollection): string[] {
  const cols = ["id"];
  if (c.locales.length > 0) cols.push("entity_id", "locale");
  for (const f of c.fields) {
    const def = fieldDef(f);
    if (!isManyField(def)) cols.push(columnNameFor(f));
  }
  cols.push("created_at", "updated_at", "published_at");
  return cols;
}

function createJoinTable(
  dialect: SqlDialect,
  collection: string,
  fieldName: string,
  target: string,
): string {
  const q = (id: string) => dialect.quoteId(id);
  const t = joinTableNameFor(collection, fieldName);
  return (
    `CREATE TABLE ${q(t)} (\n` +
    `  ${q("owner_id")} ${dialect.idType} NOT NULL REFERENCES ${q(collection)}(${q("id")}) ON DELETE CASCADE,\n` +
    `  ${q("ref_id")} ${dialect.idType} NOT NULL REFERENCES ${q(target)}(${q("id")}) ON DELETE CASCADE,\n` +
    `  ${q("sort")} INTEGER NOT NULL DEFAULT 0,\n` +
    `  PRIMARY KEY (${q("owner_id")}, ${q("ref_id")})\n` +
    `);`
  );
}

function columnAffecting(f: SnapshotField): boolean {
  const def = fieldDef(f);
  return !isManyField(def);
}

function mustFind(snapshot: SchemaSnapshot, name: string): SnapshotCollection {
  const c = snapshot.collections.find((x) => x.name === name);
  if (!c) throw new Error(`Collection "${name}" not in target snapshot`);
  return c;
}
