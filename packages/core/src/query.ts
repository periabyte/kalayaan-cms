/** The deliberately constrained query DSL both adapter families implement in full. */

export interface WhereOps {
  eq?: unknown;
  ne?: unknown;
  in?: unknown[];
  lt?: unknown;
  lte?: unknown;
  gt?: unknown;
  gte?: unknown;
  contains?: string;
}

/** `{ field: value }` is shorthand for `{ field: { eq: value } }`. */
export type Where = Record<string, unknown | WhereOps>;

export interface Sort {
  field: string;
  dir: "asc" | "desc";
}

export interface Query {
  collection: string;
  where?: Where;
  /** OR-groups, each ANDed internally, ORed together and ANDed with `where`. */
  or?: Where[];
  sort?: Sort[];
  /** Max 100; defaults to 20. */
  limit?: number;
  /** Opaque keyset cursor from a previous page. */
  cursor?: string;
  /** Relation/media field names to resolve. Depth 1 in Phase 1; dot paths later. */
  populate?: string[];
  locale?: string;
}

export const MAX_LIMIT = 100;
export const DEFAULT_LIMIT = 20;

export interface Doc {
  id: string;
  [field: string]: unknown;
}

export interface DocRef {
  collection: string;
  /** id takes precedence; slug requires the collection to have a slug field. */
  id?: string;
  slug?: string;
  locale?: string;
  /** Relation/media field names to resolve into nested objects (depth 1). */
  populate?: string[];
}

export interface Page {
  docs: Doc[];
  /** Cursor for the next page, or null when this is the last page. */
  cursor: string | null;
}
