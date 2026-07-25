import type { SnapshotField } from "@kalayaan/config";
import { columnNameFor, fieldDef, type SqlDialect } from "@kalayaan/adapter-relational";
import { PG_SYSTEM_TABLE_DDL } from "./system-tables.js";

function q(ident: string): string {
  return `"${ident.replaceAll('"', '""')}"`;
}

function lit(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * Postgres dialect. Unlike SQLite it has real `ALTER TABLE DROP/ADD COLUMN`
 * (so `supportsAlterColumn: true`, no copy-rename), transactional DDL, native
 * BOOLEAN, and `$1..$n` bind parameters. Timestamps are stored as BIGINT epoch
 * millis to match the engine-agnostic write path (`Date.now()`), and richText
 * stays TEXT so the shared adapter's JSON stringify/parse round-trip is
 * unchanged across engines.
 */
export const postgresDialect: SqlDialect = {
  id: "postgres",
  quoteId: q,
  quoteLiteral: lit,
  renderParams(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  },
  likeOperator: "ILIKE",
  encodeParam: (value) => value,
  decodeBoolean: (value) => value === true || value === 1 || value === "t",

  timestampType: "BIGINT",
  idType: "TEXT",
  supportsAlterColumn: true,
  ddlTransactional: true,
  systemTableDDL: () => PG_SYSTEM_TABLE_DDL,

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
        const type = def.integer ? "BIGINT" : "DOUBLE PRECISION";
        const dflt = def.default !== undefined ? ` DEFAULT ${def.default}` : "";
        return `${name} ${type}${notNull(def.default !== undefined)}${dflt}`;
      }
      case "boolean": {
        const dflt = def.default !== undefined ? ` DEFAULT ${def.default ? "true" : "false"}` : "";
        return `${name} BOOLEAN${notNull(def.default !== undefined)}${dflt}`;
      }
      case "date":
        return `${name} BIGINT`;
    }
  },
};
