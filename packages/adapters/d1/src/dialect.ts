import type { SnapshotField } from "@kalayaan/config";
import { columnNameFor, fieldDef, type SqlDialect } from "@kalayaan/adapter-relational";
import { SYSTEM_TABLE_DDL } from "./system-tables.js";

function q(ident: string): string {
  return `"${ident.replaceAll('"', '""')}"`;
}

function lit(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * SQLite dialect for Cloudflare D1. SQLite can't `DROP`/`ALTER COLUMN`, so it
 * relies on the shared emitter's copy-rename path (`supportsAlterColumn:
 * false`). Uniqueness is always a separate `CREATE UNIQUE INDEX` so
 * `ALTER TABLE ADD COLUMN` stays available and localized collections can swap
 * `(field)` for `(field, locale)` uniqueness.
 */
export const sqliteDialect: SqlDialect = {
  id: "sqlite",
  quoteId: q,
  quoteLiteral: lit,
  renderParams: (sql) => sql,
  likeOperator: "LIKE",
  encodeParam: (value) => (typeof value === "boolean" ? (value ? 1 : 0) : value),
  decodeBoolean: (value) => value === 1 || value === true,

  timestampType: "INTEGER",
  idType: "TEXT",
  supportsAlterColumn: false,
  ddlTransactional: false,
  systemTableDDL: () => SYSTEM_TABLE_DDL,

  columnDefinition(f: SnapshotField, opts: { freshTable: boolean }): string | null {
    const def = fieldDef(f);
    const name = q(columnNameFor(f));
    const notNull = (canNotNull: boolean) =>
      def.required && (opts.freshTable || canNotNull) ? " NOT NULL" : "";

    switch (def.type) {
      case "text": {
        const dflt = def.default !== undefined ? ` DEFAULT ${lit(def.default)}` : "";
        return `${name} TEXT${notNull(def.default !== undefined)}${dflt}`;
      }
      case "slug":
        return `${name} TEXT${notNull(false)}`;
      case "richText":
      case "custom":
        return `${name} TEXT`;
      case "media":
        if (def.many) return null;
        return `${name} TEXT REFERENCES ${q("media")}(${q("id")}) ON DELETE SET NULL`;
      case "relation": {
        if (def.many) return null;
        const action =
          def.onDelete === "cascade"
            ? "CASCADE"
            : def.onDelete === "setNull"
              ? "SET NULL"
              : "RESTRICT";
        return `${name} TEXT REFERENCES ${q(def.to)}(${q("id")}) ON DELETE ${action}`;
      }
      case "select": {
        const check = ` CHECK (${name} IN (${def.options.map(lit).join(", ")}))`;
        const dflt = def.default !== undefined ? ` DEFAULT ${lit(def.default)}` : "";
        return `${name} TEXT${notNull(def.default !== undefined)}${dflt}${check}`;
      }
      case "number": {
        const type = def.integer ? "INTEGER" : "REAL";
        const dflt = def.default !== undefined ? ` DEFAULT ${def.default}` : "";
        return `${name} ${type}${notNull(def.default !== undefined)}${dflt}`;
      }
      case "boolean": {
        const dflt = def.default !== undefined ? ` DEFAULT ${def.default ? 1 : 0}` : "";
        return `${name} INTEGER${notNull(def.default !== undefined)}${dflt}`;
      }
      case "date":
        return `${name} INTEGER`;
    }
  },
};
