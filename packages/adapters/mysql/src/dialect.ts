import type { SnapshotField } from "@kalayaan/config";
import { columnNameFor, fieldDef, type SqlDialect } from "@kalayaan/adapter-relational";
import { MYSQL_SYSTEM_TABLE_DDL } from "./system-tables.js";

/** Bounded VARCHAR width for identity/key columns and indexed strings. */
const KEY_LEN = 255;

function q(ident: string): string {
  return `\`${ident.replaceAll("`", "``")}\``;
}

function lit(value: string): string {
  return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "''")}'`;
}

/**
 * MySQL dialect. Backtick identifiers, `?` placeholders, and 1/0 for booleans
 * (TINYINT). Unlike Postgres, MySQL can't put TEXT in a primary key or index
 * without a prefix length, so identity/key columns and indexed strings use
 * VARCHAR(255). DDL is non-transactional (`ddlTransactional: false`): MySQL
 * implicitly commits on every DDL statement, so migrations aren't atomic —
 * documented behaviour, matching the plan.
 */
export const mysqlDialect: SqlDialect = {
  id: "mysql",
  quoteId: q,
  quoteLiteral: lit,
  renderParams: (sql) => sql,
  likeOperator: "LIKE",
  encodeParam: (value) => (typeof value === "boolean" ? (value ? 1 : 0) : value),
  decodeBoolean: (value) => value === 1 || value === true || value === "1",

  timestampType: "BIGINT",
  idType: `VARCHAR(${KEY_LEN})`,
  supportsAlterColumn: true,
  ddlTransactional: false,
  systemTableDDL: () => MYSQL_SYSTEM_TABLE_DDL,

  columnDefinition(f: SnapshotField, opts: { freshTable: boolean }): string | null {
    const def = fieldDef(f);
    const name = q(columnNameFor(f));
    const notNull = (canNotNull: boolean) =>
      def.required && (opts.freshTable || canNotNull) ? " NOT NULL" : "";

    switch (def.type) {
      case "text": {
        // VARCHAR (not TEXT) so a unique index can cover the whole value.
        const dflt = def.default !== undefined ? ` DEFAULT ${lit(def.default)}` : "";
        return `${name} VARCHAR(${KEY_LEN})${notNull(def.default !== undefined)}${dflt}`;
      }
      case "slug":
        return `${name} VARCHAR(${KEY_LEN})${notNull(false)}`;
      case "richText":
      case "custom":
        return `${name} TEXT`;
      case "media":
        if (def.many) return null;
        return `${name} VARCHAR(${KEY_LEN}) REFERENCES ${q("media")}(${q("id")}) ON DELETE SET NULL`;
      case "relation": {
        if (def.many) return null;
        const action =
          def.onDelete === "cascade"
            ? "CASCADE"
            : def.onDelete === "setNull"
              ? "SET NULL"
              : "RESTRICT";
        return `${name} VARCHAR(${KEY_LEN}) REFERENCES ${q(def.to)}(${q("id")}) ON DELETE ${action}`;
      }
      case "select": {
        const check = ` CHECK (${name} IN (${def.options.map(lit).join(", ")}))`;
        const dflt = def.default !== undefined ? ` DEFAULT ${lit(def.default)}` : "";
        return `${name} VARCHAR(${KEY_LEN})${notNull(def.default !== undefined)}${dflt}${check}`;
      }
      case "number": {
        const type = def.integer ? "BIGINT" : "DOUBLE";
        const dflt = def.default !== undefined ? ` DEFAULT ${def.default}` : "";
        return `${name} ${type}${notNull(def.default !== undefined)}${dflt}`;
      }
      case "boolean": {
        const dflt = def.default !== undefined ? ` DEFAULT ${def.default ? 1 : 0}` : "";
        return `${name} TINYINT(1)${notNull(def.default !== undefined)}${dflt}`;
      }
      case "date":
        return `${name} BIGINT`;
    }
  },
};
