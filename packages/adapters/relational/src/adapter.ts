import type { SchemaChange, SchemaSnapshot, SnapshotCollection } from "@kalayaan/config";
import {
  EdgeCMSError,
  slugify,
  ulid,
  type DatabaseAdapter,
  type Doc,
  type DocRef,
  type MigrationPlan,
  type Page,
  type Query,
} from "@kalayaan/core";
import { emitDDL, type SqlDialect } from "./dialect.js";
import { columnName, fieldDef, findField, isLocalized, isManyField, joinTableName } from "./naming.js";
import { buildFind, encodeCursor } from "./query-builder.js";

export interface SqlRows {
  rows: Record<string, unknown>[];
}

export abstract class RelationalAdapter implements DatabaseAdapter {
  readonly kind = "relational" as const;

  constructor(
    protected readonly snapshot: SchemaSnapshot,
    protected readonly dialect: SqlDialect,
  ) {}

  protected abstract exec(sql: string, params: unknown[]): Promise<SqlRows>;
  /** Execute statements atomically where the engine allows (D1: batch; PG/MySQL: tx). */
  protected abstract execBatch(statements: { sql: string; params: unknown[] }[]): Promise<void>;

  private q(ident: string): string {
    return this.dialect.quoteId(ident);
  }

  // ---- reads ----

  async find(query: Query): Promise<Page> {
    const c = this.collection(query.collection);
    const compiled = buildFind(query, c, this.dialect);
    const { rows } = await this.exec(compiled.sql, compiled.params);
    const hasMore = rows.length > compiled.limit;
    const pageRows = hasMore ? rows.slice(0, compiled.limit) : rows;
    const docs = await this.hydrate(c, pageRows, query.populate ?? []);
    const last = pageRows[pageRows.length - 1];
    const cursor =
      hasMore && last
        ? encodeCursor(compiled.sort.map((s) => last[s.field === "id" ? "id" : sortKey(c, s.field)]))
        : null;
    return { docs, cursor };
  }

  async findOne(ref: DocRef): Promise<Doc | null> {
    const c = this.collection(ref.collection);
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (ref.id !== undefined) {
      conditions.push(`${this.q("id")} = ?`);
      params.push(ref.id);
    } else if (ref.slug !== undefined) {
      const slugField = c.fields.find((f) => fieldDef(f).type === "slug");
      if (!slugField)
        throw new EdgeCMSError("bad_request", `"${ref.collection}" has no slug field`);
      conditions.push(`${this.q(columnName(slugField))} = ?`);
      params.push(ref.slug);
    } else {
      throw new EdgeCMSError("bad_request", "findOne needs an id or slug");
    }
    if (isLocalized(c)) {
      conditions.push(`${this.q("locale")} = ?`);
      params.push(ref.locale ?? c.locales[0]);
    }
    const { rows } = await this.exec(
      `SELECT * FROM ${this.q(c.name)} WHERE ${conditions.join(" AND ")} LIMIT 1`,
      params,
    );
    if (!rows[0]) return null;
    const [doc] = await this.hydrate(c, [rows[0]], []);
    return doc ?? null;
  }

  /**
   * Resolve a unique slug by appending `-2`, `-3`, … when `base` (or a prior
   * suffix) is already taken. Locale-scoped for localized collections, since
   * the uniqueness index there is `(slug, locale)`. Best-effort against
   * concurrent writes — the DB's unique constraint remains the hard guarantee.
   */
  private async uniqueSlug(
    c: SnapshotCollection,
    column: string,
    base: string,
    locale: string | undefined,
  ): Promise<string> {
    const conditions = [`(${this.q(column)} = ? OR ${this.q(column)} LIKE ?)`];
    const params: unknown[] = [base, `${base}-%`];
    if (locale !== undefined) {
      conditions.push(`${this.q("locale")} = ?`);
      params.push(locale);
    }
    const { rows } = await this.exec(
      `SELECT ${this.q(column)} AS slug FROM ${this.q(c.name)} WHERE ${conditions.join(" AND ")}`,
      params,
    );
    const taken = new Set(rows.map((r) => r.slug));
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base}-${n}`)) n++;
    return `${base}-${n}`;
  }

  // ---- writes ----

  async create(collection: string, doc: Record<string, unknown>): Promise<Doc> {
    const c = this.collection(collection);
    const id = ulid();
    const now = Date.now();
    const columns: string[] = ["id", "created_at", "updated_at"];
    const values: unknown[] = [id, now, now];
    if (isLocalized(c)) {
      columns.push("entity_id", "locale");
      values.push((doc.entity_id as string | undefined) ?? id, doc.locale ?? c.locales[0]);
    }
    if (doc.published_at !== undefined) {
      columns.push("published_at");
      values.push(doc.published_at);
    }
    const manyWrites: { sql: string; params: unknown[] }[] = [];
    for (const f of c.fields) {
      const def = fieldDef(f);
      const value = doc[f.name];
      if (isManyField(def)) {
        for (const [i, refId] of (asIdArray(f.name, value) ?? []).entries()) {
          manyWrites.push({
            sql: `INSERT INTO ${this.q(joinTableName(c.name, f.name))} (${this.q("owner_id")}, ${this.q("ref_id")}, ${this.q("sort")}) VALUES (?, ?, ?)`,
            params: [id, refId, i],
          });
        }
        continue;
      }
      // Auto-generate a slug from its source field when none was provided, so
      // slugs always exist regardless of the client (admin, MCP, API keys), and
      // de-duplicate (`-2`, `-3`, …) against existing unique slugs.
      if (def.type === "slug") {
        const provided = typeof value === "string" ? value.trim() : "";
        let slug = provided || slugify(String(doc[def.from] ?? ""));
        if (slug && def.unique) {
          slug = await this.uniqueSlug(c, columnName(f), slug, isLocalized(c) ? String(doc.locale ?? c.locales[0]) : undefined);
        }
        if (slug) {
          columns.push(columnName(f));
          values.push(slug);
        }
        continue;
      }
      if (value === undefined) {
        const dflt = defaultFor(def);
        if (dflt !== undefined) {
          columns.push(columnName(f));
          values.push(dflt);
        }
        continue;
      }
      columns.push(columnName(f));
      values.push(toStored(def.type, value));
    }
    const placeholders = columns.map(() => "?").join(", ");
    await this.execBatch([
      {
        sql: `INSERT INTO ${this.q(c.name)} (${columns.map((x) => this.q(x)).join(", ")}) VALUES (${placeholders})`,
        params: values.map(this.dialect.encodeParam),
      },
      ...manyWrites,
    ]);
    const created = await this.findOne({ collection, id, ...(doc.locale !== undefined && { locale: doc.locale as string }) });
    return created!;
  }

  async update(ref: DocRef, patch: Record<string, unknown>): Promise<Doc> {
    const c = this.collection(ref.collection);
    const existing = await this.findOne(ref);
    if (!existing)
      throw new EdgeCMSError("not_found", `${ref.collection}/${ref.id ?? ref.slug} not found`);
    const id = existing.id;
    const sets: string[] = [`${this.q("updated_at")} = ?`];
    const params: unknown[] = [Date.now()];
    const statements: { sql: string; params: unknown[] }[] = [];
    for (const f of c.fields) {
      if (!(f.name in patch)) continue;
      const def = fieldDef(f);
      const value = patch[f.name];
      if (isManyField(def)) {
        statements.push({
          sql: `DELETE FROM ${this.q(joinTableName(c.name, f.name))} WHERE ${this.q("owner_id")} = ?`,
          params: [id],
        });
        for (const [i, refId] of (asIdArray(f.name, value) ?? []).entries()) {
          statements.push({
            sql: `INSERT INTO ${this.q(joinTableName(c.name, f.name))} (${this.q("owner_id")}, ${this.q("ref_id")}, ${this.q("sort")}) VALUES (?, ?, ?)`,
            params: [id, refId, i],
          });
        }
        continue;
      }
      sets.push(`${this.q(columnName(f))} = ?`);
      params.push(value === null ? null : this.dialect.encodeParam(toStored(def.type, value)));
    }
    if ("published_at" in patch) {
      sets.push(`${this.q("published_at")} = ?`);
      params.push(patch.published_at);
    }
    params.push(id);
    statements.unshift({
      sql: `UPDATE ${this.q(c.name)} SET ${sets.join(", ")} WHERE ${this.q("id")} = ?`,
      params,
    });
    await this.execBatch(statements);
    return (await this.findOne({ collection: ref.collection, id, ...(ref.locale !== undefined && { locale: ref.locale }) }))!;
  }

  async delete(ref: DocRef): Promise<void> {
    const c = this.collection(ref.collection);
    const existing = await this.findOne(ref);
    if (!existing)
      throw new EdgeCMSError("not_found", `${ref.collection}/${ref.id ?? ref.slug} not found`);
    const statements: { sql: string; params: unknown[] }[] = [];
    for (const f of c.fields) {
      const def = fieldDef(f);
      if (isManyField(def))
        statements.push({
          sql: `DELETE FROM ${this.q(joinTableName(c.name, f.name))} WHERE ${this.q("owner_id")} = ?`,
          params: [existing.id],
        });
    }
    statements.push({ sql: `DELETE FROM ${this.q(c.name)} WHERE ${this.q("id")} = ?`, params: [existing.id] });
    await this.execBatch(statements);
  }

  // ---- migrations ----

  async planMigration(
    changes: SchemaChange[],
    next: SchemaSnapshot,
    prev: SchemaSnapshot | null,
  ): Promise<MigrationPlan> {
    const statements = emitDDL(this.dialect, changes, next, prev);
    return { statements, destructive: statements.some((s) => s.destructive) };
  }

  async applyMigration(plan: MigrationPlan): Promise<void> {
    await this.execBatch(plan.statements.map((s) => ({ sql: s.sql, params: [] })));
  }

  async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> {
    // Best-effort: individual writes are already batched; engines with real
    // transactions override this.
    return fn(this);
  }

  // ---- helpers ----

  protected collection(name: string): SnapshotCollection {
    const c = this.snapshot.collections.find((x) => x.name === name);
    if (!c) throw new EdgeCMSError("not_found", `Unknown collection "${name}"`);
    return c;
  }

  /** Map rows to docs: rename columns, decode types, attach many-relation ids, populate. */
  private async hydrate(
    c: SnapshotCollection,
    rows: Record<string, unknown>[],
    populate: string[],
  ): Promise<Doc[]> {
    const docs: Doc[] = rows.map((row) => {
      const doc: Doc = { id: row.id as string };
      if (isLocalized(c)) {
        doc.entity_id = row.entity_id;
        doc.locale = row.locale;
      }
      for (const f of c.fields) {
        const def = fieldDef(f);
        if (isManyField(def)) continue;
        doc[f.name] = fromStored(def.type, row[columnName(f)], this.dialect);
      }
      doc.created_at = row.created_at;
      doc.updated_at = row.updated_at;
      doc.published_at = row.published_at;
      return doc;
    });
    if (docs.length === 0) return docs;

    const ids = docs.map((d) => d.id);
    for (const f of c.fields) {
      const def = fieldDef(f);
      if (!isManyField(def)) continue;
      const placeholders = ids.map(() => "?").join(", ");
      const { rows: joins } = await this.exec(
        `SELECT ${this.q("owner_id")}, ${this.q("ref_id")} FROM ${this.q(joinTableName(c.name, f.name))} WHERE ${this.q("owner_id")} IN (${placeholders}) ORDER BY ${this.q("sort")}`,
        ids,
      );
      const byOwner = new Map<string, string[]>();
      for (const j of joins) {
        const list = byOwner.get(j.owner_id as string) ?? [];
        list.push(j.ref_id as string);
        byOwner.set(j.owner_id as string, list);
      }
      for (const doc of docs) doc[f.name] = byOwner.get(doc.id) ?? [];
    }

    for (const fieldName of populate) await this.populateField(c, docs, fieldName);
    return docs;
  }

  private async populateField(c: SnapshotCollection, docs: Doc[], fieldName: string): Promise<void> {
    const f = findField(c, fieldName);
    if (!f) throw new EdgeCMSError("bad_request", `Cannot populate unknown field "${fieldName}"`);
    const def = fieldDef(f);
    let target: string;
    if (def.type === "relation") target = def.to;
    else if (def.type === "media") target = "media";
    else throw new EdgeCMSError("bad_request", `Cannot populate ${def.type} field "${fieldName}"`);

    const wanted = new Set<string>();
    for (const doc of docs) {
      const v = doc[fieldName];
      if (Array.isArray(v)) for (const id of v) wanted.add(id as string);
      else if (typeof v === "string") wanted.add(v);
    }
    if (wanted.size === 0) return;

    const idList = [...wanted];
    const placeholders = idList.map(() => "?").join(", ");
    const { rows } = await this.exec(
      `SELECT * FROM ${this.q(target)} WHERE ${this.q("id")} IN (${placeholders})`,
      idList,
    );
    let byId: Map<string, Doc>;
    if (def.type === "media") {
      byId = new Map(rows.map((r) => [r.id as string, r as Doc]));
    } else {
      const targetCollection = this.collection(target);
      const hydrated = await this.hydrate(targetCollection, rows, []);
      byId = new Map(hydrated.map((d) => [d.id, d]));
    }
    for (const doc of docs) {
      const v = doc[fieldName];
      if (Array.isArray(v)) doc[fieldName] = v.map((id) => byId.get(id as string) ?? id);
      else if (typeof v === "string") doc[fieldName] = byId.get(v) ?? v;
    }
  }
}

function sortKey(c: SnapshotCollection, field: string): string {
  const f = findField(c, field);
  return f ? f.name : field;
}

function asIdArray(fieldName: string, value: unknown): string[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string"))
    throw new EdgeCMSError("validation_failed", `"${fieldName}" must be an array of ids`);
  return value as string[];
}

function defaultFor(def: { type: string; default?: unknown }): unknown {
  if (def.default === undefined) return undefined;
  if (def.type === "date" && def.default === "now") return Date.now();
  return toStored(def.type, def.default);
}

function toStored(type: string, value: unknown): unknown {
  switch (type) {
    // Custom (plugin) values share richText's JSON-text storage: the plugin
    // validator decides the shape; we persist strings as-is and JSON-encode
    // anything else.
    case "richText":
    case "custom":
      return typeof value === "string" ? value : JSON.stringify(value);
    default:
      return value;
  }
}

function fromStored(type: string, value: unknown, dialect: SqlDialect): unknown {
  if (value === null || value === undefined) return null;
  switch (type) {
    case "richText":
    case "custom":
      try {
        return JSON.parse(value as string) as unknown;
      } catch {
        return value;
      }
    case "boolean":
      return dialect.decodeBoolean(value);
    default:
      return value;
  }
}
