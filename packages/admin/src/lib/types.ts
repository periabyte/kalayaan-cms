import type { FieldDef, PermissionGrant } from "@kalayaan/config";

export type { PermissionAction, PermissionGrant } from "@kalayaan/config";

/** Serialized permission rules the SPA uses to hide actions a user can't perform. */
export interface AbilityRules {
  grants: PermissionGrant[];
  superuser?: boolean;
}

export interface SchemaField {
  name: string;
  type: FieldDef["type"];
  label?: string;
  required?: boolean;
  [key: string]: unknown;
}

export interface SchemaCollection {
  name: string;
  titleField: string | null;
  versioning: boolean;
  locales: string[];
  /** Single-page collection: one entry per locale, edited directly (no list). */
  singleton?: boolean;
  fields: SchemaField[];
}

export interface SchemaFeatures {
  versions: boolean;
  webhooks: boolean;
  savedFilters: boolean;
  mtReview: boolean;
  statuses: string[];
  /** Plugin-registered custom field types the server can validate. */
  customFieldTypes?: string[];
}

export interface Schema {
  name: string;
  ui: { brandColor: string | null; logo: string | null };
  auth: { providers: string[] };
  ai: { enabled: boolean; features: string[] };
  features?: SchemaFeatures;
  collections: SchemaCollection[];
}

export type PublishStatus = "draft" | "published" | "scheduled";

export interface Doc {
  id: string;
  created_at: number;
  updated_at: number;
  published_at: number | null;
  /** Derived publish state attached by the runtime (see status.ts). */
  publishStatus?: PublishStatus;
  /** Whether the latest version is machine-translated awaiting review. */
  mt?: boolean;
  entity_id?: string;
  locale?: string;
  [field: string]: unknown;
}

export interface Page {
  docs: Doc[];
  cursor: string | null;
}

export interface CurrentUser {
  id: string;
  email: string;
  role: string;
  name: string | null;
}

/** A role the project defines, surfaced by the users API for the role picker. */
export interface Role {
  name: string;
  label: string;
  admin: boolean;
}

/** A user as managed in the Users & roles admin panel. */
export interface ManagedUser {
  id: string;
  email: string;
  role: string;
  disabledAt: number | null;
  createdAt: number;
  name: string | null;
}

export interface MediaRecord {
  id: string;
  key: string;
  filename: string;
  mime: string;
  size: number;
  alt: string | null;
  width: number | null;
  height: number | null;
  createdAt: number;
}

export type VersionStatus = "draft" | "published" | "scheduled" | "mt-review" | "autosave";

export interface VersionSummary {
  id: string;
  collection: string;
  entityId: string;
  locale: string | null;
  status: VersionStatus;
  createdAt: number;
  createdBy: string | null;
}

export type WebhookEvent = "document.published" | "document.updated" | "document.deleted";

export interface Webhook {
  id: string;
  url: string;
  events: WebhookEvent[];
  active: boolean;
  createdAt: number;
}

export interface SavedFilter {
  id: string;
  collection: string;
  name: string;
  query: Record<string, unknown>;
  createdAt: number;
}

export interface ApiKey {
  id: string;
  name: string;
  /** Public, non-secret display prefix, e.g. "kcms_a1b2c3d". */
  keyPrefix: string;
  grants: PermissionGrant[];
  expiresAt: number | null;
  revokedAt: number | null;
  createdAt: number;
  lastUsedAt: number | null;
}

export interface CreateApiKeyInput {
  name: string;
  grants: PermissionGrant[];
  expiresAt?: number | null;
}
