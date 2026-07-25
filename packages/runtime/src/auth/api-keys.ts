import { ulid } from "@kalayaan/core";
import { SYSTEM_SUBJECTS, type PermissionAction, type PermissionGrant } from "@kalayaan/config";
import { randomToken, sha256Hex } from "./tokens.js";

export interface ApiKeyRecord {
  id: string;
  name: string;
  /** Public, non-secret prefix shown in the UI, e.g. "kcms_a1b2c3d". */
  keyPrefix: string;
  grants: PermissionGrant[];
  /** epoch ms; null = never expires. */
  expiresAt: number | null;
  /** epoch ms the key was revoked, or null if active. */
  revokedAt: number | null;
  createdAt: number;
  lastUsedAt: number | null;
}

export interface CreateApiKeyInput {
  name: string;
  grants: PermissionGrant[];
  /** epoch ms; omit/null = never expires. */
  expiresAt?: number | null;
}

const KEY_PREFIX = "kcms_";
/** Length of the public display prefix (KEY_PREFIX + a few key chars). */
const PREFIX_DISPLAY_LEN = KEY_PREFIX.length + 7;

/**
 * Raw queries against the fixed `api_keys` system table. Keys are shown to the
 * user exactly once at creation; only their SHA-256 hash is stored. Keys carry
 * permission grants (the same model as user roles), an optional expiry, and a
 * revocation timestamp. `findByRawKey` never returns an expired or revoked key.
 */
export class ApiKeysStore {
  constructor(private readonly db: D1Database) {}

  async create(input: CreateApiKeyInput): Promise<{ record: ApiKeyRecord; rawKey: string }> {
    const id = ulid();
    const rawKey = `${KEY_PREFIX}${randomToken(24)}`;
    const keyHash = await sha256Hex(rawKey);
    const keyPrefix = rawKey.slice(0, PREFIX_DISPLAY_LEN);
    const now = Date.now();
    const expiresAt = input.expiresAt ?? null;
    await this.db
      .prepare(
        `INSERT INTO "api_keys" ("id", "name", "key_hash", "key_prefix", "scopes", "expires_at", "created_at")
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, input.name, keyHash, keyPrefix, JSON.stringify({ grants: input.grants }), expiresAt, now)
      .run();
    return {
      record: {
        id,
        name: input.name,
        keyPrefix,
        grants: input.grants,
        expiresAt,
        revokedAt: null,
        createdAt: now,
        lastUsedAt: null,
      },
      rawKey,
    };
  }

  /** Resolve a raw bearer key to its record, or null if unknown/revoked/expired. */
  async findByRawKey(rawKey: string): Promise<ApiKeyRecord | null> {
    if (!rawKey.startsWith(KEY_PREFIX)) return null;
    const keyHash = await sha256Hex(rawKey);
    const row = await this.db
      .prepare(`SELECT * FROM "api_keys" WHERE "key_hash" = ?`)
      .bind(keyHash)
      .first<Row>();
    if (!row) return null;
    if (row.revoked_at != null) return null;
    if (row.expires_at != null && Date.now() > row.expires_at) return null;
    // Best-effort touch; failures here must never block the request.
    this.db
      .prepare(`UPDATE "api_keys" SET "last_used_at" = ? WHERE "id" = ?`)
      .bind(Date.now(), row.id)
      .run()
      .catch(() => undefined);
    return fromRow(row);
  }

  async list(): Promise<ApiKeyRecord[]> {
    const { results } = await this.db.prepare(`SELECT * FROM "api_keys" ORDER BY "created_at" DESC`).all<Row>();
    return results.map(fromRow);
  }

  /** Soft-revoke: the key stays listed (as revoked) but no longer authenticates. */
  async revoke(id: string): Promise<void> {
    await this.db
      .prepare(`UPDATE "api_keys" SET "revoked_at" = ? WHERE "id" = ? AND "revoked_at" IS NULL`)
      .bind(Date.now(), id)
      .run();
  }

  async delete(id: string): Promise<void> {
    await this.db.prepare(`DELETE FROM "api_keys" WHERE "id" = ?`).bind(id).run();
  }
}

interface Row {
  id: string;
  name: string;
  key_hash: string;
  key_prefix: string | null;
  scopes: string;
  expires_at: number | null;
  revoked_at: number | null;
  created_at: number;
  last_used_at: number | null;
}

function fromRow(row: Row): ApiKeyRecord {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.key_prefix ?? "",
    grants: grantsFromStored(row.scopes),
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

/**
 * Parse the stored `scopes` JSON. New keys store `{ grants: [...] }`; legacy
 * keys stored `{ scopes: ["read"|"write"|"manage"], collections?: [...] }`,
 * which we translate to the grant model on read.
 */
function grantsFromStored(raw: string): PermissionGrant[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { grants?: unknown }).grants)) {
    return (parsed as { grants: PermissionGrant[] }).grants;
  }
  return legacyScopesToGrants(parsed as LegacyScopes);
}

interface LegacyScopes {
  scopes?: string[];
  collections?: string[];
}

/**
 * Translate the coarse read/write/manage scope model (still accepted by the
 * key-creation API for convenience) into permission grants.
 */
export function grantsFromScopes(scopes: string[], collections?: string[]): PermissionGrant[] {
  return legacyScopesToGrants({ scopes, ...(collections && { collections }) });
}

function legacyScopesToGrants(legacy: LegacyScopes): PermissionGrant[] {
  const scopes = legacy?.scopes ?? [];
  const subjects: string[] | "*" = legacy?.collections?.length ? legacy.collections : "*";
  const grants: PermissionGrant[] = [];
  const contentActions: PermissionAction[] = [];
  if (scopes.includes("read")) contentActions.push("read");
  if (scopes.includes("write")) contentActions.push("create", "update", "delete", "publish");
  if (contentActions.length) grants.push({ subjects, actions: contentActions });
  if (scopes.includes("manage"))
    grants.push({ subjects: [...SYSTEM_SUBJECTS], actions: ["read", "create", "update", "delete", "manage"] });
  return grants;
}
