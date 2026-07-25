import type { FieldDef, SnapshotCollection, SnapshotField } from "@kalayaan/config";

export function fieldDef(f: SnapshotField): FieldDef {
  return f.def as unknown as FieldDef;
}

/** DB column name for a field: single relations and media get an `_id` suffix. */
export function columnName(f: SnapshotField): string {
  const def = fieldDef(f);
  if (def.type === "media" || (def.type === "relation" && !def.many)) return `${f.name}_id`;
  return f.name;
}

export function joinTableName(collection: string, fieldName: string): string {
  return `${collection}_${fieldName}`;
}

/**
 * A field whose values live in a `<collection>_<field>` join table rather than
 * a column on the main table: a many-relation or a many-media field. Both share
 * the same owner_id/ref_id/sort join-table shape.
 */
export function isManyField(def: FieldDef): boolean {
  return (def.type === "relation" && !!def.many) || (def.type === "media" && !!def.many);
}

/** The table a join field's `ref_id` points at: a relation's target, or the fixed `media` table. */
export function joinTargetOf(def: FieldDef): string {
  if (def.type === "relation") return def.to;
  if (def.type === "media") return "media";
  throw new Error(`joinTargetOf called on non-join field type "${def.type}"`);
}

export function isLocalized(c: SnapshotCollection): boolean {
  return c.locales.length > 0;
}

export function findField(c: SnapshotCollection, name: string): SnapshotField | null {
  return c.fields.find((f) => f.name === name) ?? null;
}

/**
 * Standard-SQL identifier quoting (double quotes), valid on SQLite and
 * Postgres. Retained for callers that aren't dialect-aware; dialect-aware code
 * should prefer `dialect.quoteId`.
 */
export function q(ident: string): string {
  return `"${ident.replaceAll('"', '""')}"`;
}
