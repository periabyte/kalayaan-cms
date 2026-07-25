/** Field definitions — the discriminated union everything compiles from. */

/**
 * Attaches an AI action directly to the field it affects — the admin renders
 * a small inline "Generate with AI" control on that field instead of an
 * ambiguous global panel. `dependency` names the field to read source text
 * from; omit it for an in-place rewrite (e.g. "improve" on the same field).
 */
export interface AiEnrichOptions {
  action: "improve" | "summarize" | "seoTitle" | "seoDescription";
  dependency?: string;
}

export interface BaseFieldOptions {
  label?: string;
  required?: boolean;
  aiEnrich?: AiEnrichOptions;
}

export interface TextField extends BaseFieldOptions {
  type: "text";
  unique?: boolean;
  maxLength?: number;
  default?: string;
}

export interface SlugField extends BaseFieldOptions {
  type: "slug";
  /** Name of the text field this slug is generated from. */
  from: string;
  unique?: boolean;
}

export interface RichTextField extends BaseFieldOptions {
  type: "richText";
}

export interface MediaField extends BaseFieldOptions {
  type: "media";
  /** Hold an ordered list of assets (gallery / attachments) instead of a single one. */
  many?: boolean;
  /** Restrict what can be uploaded/picked. Omit to accept any type. */
  accept?: readonly ("image" | "video" | "file")[];
}

export interface RelationField extends BaseFieldOptions {
  type: "relation";
  /** Target collection name. */
  to: string;
  many?: boolean;
  onDelete?: "restrict" | "cascade" | "setNull";
}

export interface SelectField extends BaseFieldOptions {
  type: "select";
  options: readonly string[];
  default?: string;
}

export interface NumberField extends BaseFieldOptions {
  type: "number";
  integer?: boolean;
  unique?: boolean;
  default?: number;
}

export interface BooleanField extends BaseFieldOptions {
  type: "boolean";
  default?: boolean;
}

export interface DateField extends BaseFieldOptions {
  type: "date";
  default?: "now";
}

/**
 * A field type contributed by a plugin. The value is stored as JSON text (like
 * richText); the named plugin validator (`Plugin.fieldTypes[fieldType]`) owns
 * its real shape and runs in the write path. `control` is a hint the admin uses
 * to pick a built-in editor widget, since a prebuilt admin bundle can't load a
 * plugin's own React component.
 */
export interface CustomField extends BaseFieldOptions {
  type: "custom";
  /** Names the plugin validator registered under `Plugin.fieldTypes`. */
  fieldType: string;
  /** Admin widget hint. Defaults to a textarea. */
  control?: "text" | "textarea" | "number" | "select" | "boolean" | "json";
  /** Choices when `control` is "select". */
  options?: readonly string[];
  default?: unknown;
}

export type FieldDef =
  | TextField
  | SlugField
  | RichTextField
  | MediaField
  | RelationField
  | SelectField
  | NumberField
  | BooleanField
  | DateField
  | CustomField;

export type FieldType = FieldDef["type"];

export interface CollectionHooks {
  beforeChange?: readonly string[];
  afterChange?: readonly string[];
  afterPublish?: readonly string[];
}

export interface CollectionDef {
  name: string;
  fields: Record<string, FieldDef>;
  versioning?: boolean;
  /** List of locales, e.g. ["en", "de"]. First entry is the default locale. */
  localization?: readonly string[];
  hooks?: CollectionHooks;
  /** Field name used as the display title in the admin UI. Defaults to the first text field. */
  titleField?: string;
  /**
   * Single-page content (About, Home, Contact): exactly one entry per locale, edited
   * directly — no list of many rows, no "new entry". Localization and versioning still apply.
   */
  singleton?: boolean;
}

export type DatabaseAdapterName = "d1" | "postgres" | "mysql" | "mongodb";
export type StorageAdapterName = "r2" | "s3";
export type AIFeature = "alt-text" | "semantic-search" | "translate" | "editorial-assist";

/**
 * Per-capability Workers AI model overrides. Any field left unset falls back
 * to the runtime's current default (see `AI_MODELS` in `@kalayaan/runtime`).
 * `embedDimensions` is required alongside `embed` — the Vectorize index is
 * provisioned with this dimension, and it must match the overriding model's
 * actual output size (the default, bge-m3, is 1024).
 */
export interface AIModelOverrides {
  text?: string;
  vision?: string;
  translate?: string;
  embed?: string;
  embedDimensions?: number;
}

/**
 * Current (non-deprecated, as of this writing) Workers AI model defaults —
 * the single source of truth for both the runtime provider and the CLI's
 * Vectorize provisioning. Update here when Cloudflare deprecates a model.
 */
export const DEFAULT_AI_MODELS = {
  text: "@cf/meta/llama-3.1-8b-instruct-fast",
  vision: "@cf/meta/llama-3.2-11b-vision-instruct",
  translate: "@cf/meta/m2m100-1.2b",
  embed: "@cf/baai/bge-m3",
} as const;

/** Embedding dimensionality of DEFAULT_AI_MODELS.embed (bge-m3) — the Vectorize index must match. */
export const DEFAULT_EMBED_DIMENSIONS = 1024;
export type AuthProvider = "email" | "cloudflare-access";
export type EmailProviderName = "cloudflare" | "resend";

/* ------------------------------------------------------------------ *
 * RBAC vocabulary — the canonical permission model. The runtime's
 * `Ability` (in @kalayaan/core) enforces these grants; the admin SPA reads
 * the same shapes to hide actions a user can't perform.
 * ------------------------------------------------------------------ */

export type PermissionAction = "read" | "create" | "update" | "delete" | "publish" | "manage";

/** Fixed, non-collection permission areas. Only matched when named explicitly. */
export const SYSTEM_SUBJECTS = ["media", "webhooks", "users", "api_keys", "settings", "ai"] as const;
export type SystemSubject = (typeof SYSTEM_SUBJECTS)[number];

export interface PermissionGrant {
  /** Collection names and/or system subjects; `"*"` matches all collections. */
  subjects: string[] | "*";
  /** Actions granted on those subjects; `"*"` matches all actions. */
  actions: PermissionAction[] | "*";
}

export interface RoleDef {
  label?: string;
  /** Superuser: bypasses every check. The built-in `admin` role sets this. */
  admin?: boolean;
  permissions: PermissionGrant[];
}

export type RolesConfig = Record<string, RoleDef>;

export interface EdgeCMSConfig {
  name: string;
  database?: { adapter: DatabaseAdapterName };
  storage?: { adapter: StorageAdapterName };
  ai?: { enabled: boolean; features?: readonly AIFeature[]; models?: AIModelOverrides };
  auth?: { providers: readonly AuthProvider[] };
  /**
   * Transactional email (invites). `from` must be an address on a domain
   * onboarded to Cloudflare Email Sending. Without `from`, email is disabled and
   * invites fall back to a copyable link. `baseUrl` overrides the request origin
   * when building invite links (needed behind a custom domain).
   */
  email?: {
    provider?: EmailProviderName;
    from: string;
    fromName?: string;
    replyTo?: string;
    baseUrl?: string;
  };
  /** Expose a config-generated GraphQL read API at /api/graphql. */
  graphql?: boolean;
  /**
   * Custom domain(s) to serve the deployed Worker on (a hostname or list, e.g.
   * "blog.example.com" or ["example.com", "www.example.com"]). Each must already
   * be a zone in your Cloudflare account. Unset → the free *.workers.dev URL.
   */
  domain?: string | string[];
  ui?: { brandColor?: string; logo?: string };
  /**
   * Named roles and their permission grants. When omitted, the built-in roles
   * (`admin`, `editor`, `viewer` — see `defaultRoles()`) apply. The `admin`
   * superuser role is always present even if not declared here.
   */
  roles?: RolesConfig;
  collections: readonly CollectionDef[];
}

/** Fully validated + normalized config. All optionals filled with defaults. */
export interface ResolvedField {
  name: string;
  def: FieldDef;
}

export interface ResolvedCollection {
  name: string;
  fields: ResolvedField[];
  versioning: boolean;
  locales: string[];
  defaultLocale: string | null;
  hooks: Required<CollectionHooks>;
  titleField: string | null;
  singleton: boolean;
}

export interface ResolvedConfig {
  name: string;
  database: { adapter: DatabaseAdapterName };
  storage: { adapter: StorageAdapterName };
  ai: {
    enabled: boolean;
    features: AIFeature[];
    /** Always fully populated — unset fields resolve to the runtime's current defaults. */
    models: { text: string; vision: string; translate: string; embed: string };
    /** Embedding dimension the Vectorize index is provisioned with (1024 unless `models.embed` overrides the default). */
    embedDimensions: number;
  };
  auth: { providers: AuthProvider[] };
  /** Resolved email config. `from`/`baseUrl` are null when unset (email disabled). */
  email: {
    provider: EmailProviderName;
    from: string | null;
    fromName: string | null;
    replyTo: string | null;
    baseUrl: string | null;
  };
  graphql: boolean;
  /** Custom domains to attach at deploy time. Empty when serving on *.workers.dev. */
  domain: string[];
  ui: { brandColor: string | null; logo: string | null };
  /** Always populated — user-declared roles, or `defaultRoles()` when none given. */
  roles: RolesConfig;
  collections: ResolvedCollection[];
}
