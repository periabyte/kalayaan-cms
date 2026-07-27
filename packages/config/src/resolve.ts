import { z } from "zod";
import type {
  CollectionDef,
  EdgeCMSConfig,
  FieldDef,
  ResolvedCollection,
  ResolvedConfig,
  RolesConfig,
} from "./types.js";
import { SYSTEM_SUBJECTS, DEFAULT_AI_MODELS, DEFAULT_EMBED_DIMENSIONS } from "./types.js";
import { defaultRoles, ADMIN_ROLE, PUBLIC_ROLE } from "./roles.js";

const NAME_RE = /^[a-z][a-z0-9_]*$/;
const LOCALE_RE = /^[a-z]{2}(-[A-Z]{2})?$/;
const HOSTNAME_RE = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;

/** Column names the system claims on every collection table. */
export const RESERVED_FIELD_NAMES = new Set([
  "id",
  "entity_id",
  "locale",
  "created_at",
  "updated_at",
  "published_at",
]);

/** Table names claimed by system tables. */
export const RESERVED_COLLECTION_NAMES = new Set(["media", "users", "api_keys", "sessions"]);

const name = z
  .string()
  .regex(NAME_RE, "must be snake_case starting with a letter (a-z, 0-9, _)");

const hostname = z.string().regex(HOSTNAME_RE, "must be a hostname like example.com or blog.example.com");

const aiEnrichSchema = z.strictObject({
  action: z.enum(["improve", "summarize", "seoTitle", "seoDescription"]),
  /** Field this action reads its source text from. Defaults to itself (in-place rewrite). */
  dependency: z.string().optional(),
});

const baseField = {
  label: z.string().optional(),
  required: z.boolean().optional(),
  aiEnrich: aiEnrichSchema.optional(),
};

const fieldSchema: z.ZodType<FieldDef> = z.discriminatedUnion("type", [
  z.strictObject({
    ...baseField,
    type: z.literal("text"),
    unique: z.boolean().optional(),
    maxLength: z.number().int().positive().optional(),
    default: z.string().optional(),
  }),
  z.strictObject({
    ...baseField,
    type: z.literal("slug"),
    from: z.string(),
    unique: z.boolean().optional(),
  }),
  z.strictObject({ ...baseField, type: z.literal("richText") }),
  z.strictObject({
    ...baseField,
    type: z.literal("media"),
    many: z.boolean().optional(),
    accept: z.array(z.enum(["image", "video", "file"])).nonempty().optional(),
  }),
  z.strictObject({
    ...baseField,
    type: z.literal("relation"),
    to: z.string(),
    many: z.boolean().optional(),
    onDelete: z.enum(["restrict", "cascade", "setNull"]).optional(),
  }),
  z.strictObject({
    ...baseField,
    type: z.literal("select"),
    options: z.array(z.string()).nonempty(),
    default: z.string().optional(),
  }),
  z.strictObject({
    ...baseField,
    type: z.literal("number"),
    integer: z.boolean().optional(),
    unique: z.boolean().optional(),
    default: z.number().optional(),
  }),
  z.strictObject({ ...baseField, type: z.literal("boolean"), default: z.boolean().optional() }),
  z.strictObject({ ...baseField, type: z.literal("date"), default: z.literal("now").optional() }),
  z.strictObject({
    ...baseField,
    type: z.literal("custom"),
    fieldType: z.string().min(1),
    control: z.enum(["text", "textarea", "number", "select", "boolean", "json"]).optional(),
    options: z.array(z.string()).nonempty().optional(),
    default: z.unknown().optional(),
  }),
]) as z.ZodType<FieldDef>;

const permissionActionSchema = z.enum(["read", "create", "update", "delete", "publish", "manage"]);

const grantSchema = z.strictObject({
  subjects: z.union([z.literal("*"), z.array(z.string().min(1)).nonempty()]),
  actions: z.union([z.literal("*"), z.array(permissionActionSchema).nonempty()]),
});

const roleSchema = z.strictObject({
  label: z.string().optional(),
  admin: z.boolean().optional(),
  permissions: z.array(grantSchema),
});

const hooksSchema = z.strictObject({
  beforeChange: z.array(z.string()).optional(),
  afterChange: z.array(z.string()).optional(),
  afterPublish: z.array(z.string()).optional(),
});

const collectionSchema = z.strictObject({
  name,
  fields: z.record(z.string(), fieldSchema),
  versioning: z.boolean().optional(),
  localization: z.array(z.string().regex(LOCALE_RE, "locales look like 'en' or 'en-US'")).optional(),
  hooks: hooksSchema.optional(),
  titleField: z.string().optional(),
  singleton: z.boolean().optional(),
});

export const configSchema = z.strictObject({
  name: z.string().min(1),
  database: z.strictObject({ adapter: z.enum(["d1", "postgres", "mysql", "mongodb"]) }).optional(),
  storage: z.strictObject({ adapter: z.enum(["r2", "s3"]) }).optional(),
  ai: z
    .strictObject({
      enabled: z.boolean(),
      features: z
        .array(z.enum(["alt-text", "semantic-search", "translate", "editorial-assist"]))
        .optional(),
      models: z
        .strictObject({
          text: z.string().min(1).optional(),
          vision: z.string().min(1).optional(),
          translate: z.string().min(1).optional(),
          embed: z.string().min(1).optional(),
          embedDimensions: z.number().int().positive().optional(),
        })
        .refine((m) => !m.embed || m.embedDimensions !== undefined, {
          message:
            "ai.models.embedDimensions is required when ai.models.embed overrides the default embedding model — the Vectorize index dimension must match your model's actual output size.",
          path: ["embedDimensions"],
        })
        .optional(),
    })
    .optional(),
  auth: z
    .strictObject({ providers: z.array(z.enum(["email", "cloudflare-access"])).nonempty() })
    .optional(),
  email: z
    .strictObject({
      provider: z.enum(["cloudflare", "resend"]).optional(),
      from: z.string().email(),
      fromName: z.string().optional(),
      replyTo: z.string().email().optional(),
      baseUrl: z.string().url().optional(),
    })
    .optional(),
  graphql: z.boolean().optional(),
  domain: z.union([hostname, z.array(hostname).nonempty()]).optional(),
  ui: z.strictObject({ brandColor: z.string().optional(), logo: z.string().optional() }).optional(),
  roles: z.record(name, roleSchema).optional(),
  collections: z.array(collectionSchema),
});

export class ConfigError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`Invalid cms config:\n${issues.map((i) => `  - ${i}`).join("\n")}`);
    this.name = "ConfigError";
    this.issues = issues;
  }
}

export interface ResolveConfigOptions {
  /**
   * Permission subjects beyond collections and the built-in system areas that
   * a role's grant is allowed to name — e.g. `"marketplace:order"`, declared
   * by a plugin's `Plugin.subjects` or a route's `RouteDef.permission`. Lets
   * a project grant plugin-defined business subjects in `roles` without the
   * validator rejecting them as unknown.
   */
  extraSubjects?: readonly string[];
}

export function resolveConfig(input: EdgeCMSConfig, options: ResolveConfigOptions = {}): ResolvedConfig {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    );
  }
  const config = parsed.data as EdgeCMSConfig;

  const issues: string[] = [];
  const collectionNames = new Set<string>();
  for (const c of config.collections) {
    if (collectionNames.has(c.name)) issues.push(`collections: duplicate collection "${c.name}"`);
    collectionNames.add(c.name);
    if (RESERVED_COLLECTION_NAMES.has(c.name) || c.name.startsWith("_"))
      issues.push(`collections.${c.name}: name is reserved for system tables`);
  }

  for (const c of config.collections) {
    const fieldNames = Object.keys(c.fields);
    for (const [fname, def] of Object.entries(c.fields)) {
      const at = `collections.${c.name}.fields.${fname}`;
      if (!NAME_RE.test(fname)) issues.push(`${at}: field names must be snake_case`);
      if (RESERVED_FIELD_NAMES.has(fname)) issues.push(`${at}: field name is reserved`);
      switch (def.type) {
        case "slug": {
          const src = c.fields[def.from];
          if (!src) issues.push(`${at}: slug source "${def.from}" is not a field on "${c.name}"`);
          else if (src.type !== "text")
            issues.push(`${at}: slug source "${def.from}" must be a text field, got ${src.type}`);
          break;
        }
        case "relation":
          if (!collectionNames.has(def.to))
            issues.push(`${at}: relation target "${def.to}" is not a collection`);
          if (def.many && def.onDelete === "setNull")
            issues.push(`${at}: onDelete "setNull" is not valid for many-relations`);
          break;
        case "select": {
          const dupes = def.options.filter((o, i) => def.options.indexOf(o) !== i);
          if (dupes.length) issues.push(`${at}: duplicate options ${JSON.stringify(dupes)}`);
          if (def.default !== undefined && !def.options.includes(def.default))
            issues.push(`${at}: default "${def.default}" is not one of the options`);
          break;
        }
      }
    }
    if (c.titleField && !fieldNames.includes(c.titleField))
      issues.push(`collections.${c.name}: titleField "${c.titleField}" is not a field`);
    if (c.localization) {
      const dupes = c.localization.filter((l, i) => c.localization!.indexOf(l) !== i);
      if (dupes.length)
        issues.push(`collections.${c.name}: duplicate locales ${JSON.stringify(dupes)}`);
    }
  }

  // Roles: every named subject must be a real collection, a system subject,
  // or a plugin-declared custom subject (options.extraSubjects).
  const systemSubjects = new Set<string>(SYSTEM_SUBJECTS);
  const extraSubjects = new Set<string>(options.extraSubjects ?? []);
  for (const [roleName, def] of Object.entries(config.roles ?? {})) {
    for (const [i, grant] of def.permissions.entries()) {
      if (grant.subjects === "*") continue;
      for (const subject of grant.subjects) {
        if (!collectionNames.has(subject) && !systemSubjects.has(subject) && !extraSubjects.has(subject))
          issues.push(
            `roles.${roleName}.permissions[${i}]: subject "${subject}" is not a collection, system subject (${[...systemSubjects].join(", ")}), or a plugin-declared subject${extraSubjects.size ? ` (${[...extraSubjects].join(", ")})` : ""}`,
          );
      }
    }
  }

  if (issues.length) throw new ConfigError(issues);

  return {
    name: config.name,
    database: { adapter: config.database?.adapter ?? "d1" },
    storage: { adapter: config.storage?.adapter ?? "r2" },
    ai: {
      enabled: config.ai?.enabled ?? false,
      features: [...(config.ai?.features ?? [])],
      models: {
        text: config.ai?.models?.text ?? DEFAULT_AI_MODELS.text,
        vision: config.ai?.models?.vision ?? DEFAULT_AI_MODELS.vision,
        translate: config.ai?.models?.translate ?? DEFAULT_AI_MODELS.translate,
        embed: config.ai?.models?.embed ?? DEFAULT_AI_MODELS.embed,
      },
      embedDimensions: config.ai?.models?.embedDimensions ?? DEFAULT_EMBED_DIMENSIONS,
    },
    auth: { providers: [...(config.auth?.providers ?? ["email"])] },
    email: {
      provider: config.email?.provider ?? "cloudflare",
      from: config.email?.from ?? null,
      fromName: config.email?.fromName ?? null,
      replyTo: config.email?.replyTo ?? null,
      baseUrl: config.email?.baseUrl ?? null,
    },
    graphql: config.graphql ?? false,
    domain: config.domain === undefined ? [] : Array.isArray(config.domain) ? [...config.domain] : [config.domain],
    ui: { brandColor: config.ui?.brandColor ?? null, logo: config.ui?.logo ?? null },
    roles: resolveRoles(config.roles),
    collections: config.collections.map(resolveCollection),
  };
}

/**
 * Fill in the built-in roles when none are declared, and guarantee the reserved
 * `admin` (superuser) and `public` (anonymous) roles always exist — a project
 * can override their permissions/label, but the runtime relies on both names
 * being present.
 */
function resolveRoles(declared: RolesConfig | undefined): RolesConfig {
  const builtins = defaultRoles();
  const roles: RolesConfig = declared && Object.keys(declared).length ? { ...declared } : builtins;
  if (!roles[ADMIN_ROLE]) roles[ADMIN_ROLE] = builtins[ADMIN_ROLE]!;
  if (!roles[PUBLIC_ROLE]) roles[PUBLIC_ROLE] = builtins[PUBLIC_ROLE]!;
  return roles;
}

function resolveCollection(c: CollectionDef): ResolvedCollection {
  const fields = Object.entries(c.fields).map(([fname, def]) => ({ name: fname, def }));
  const firstText = fields.find((f) => f.def.type === "text")?.name ?? null;
  return {
    name: c.name,
    fields,
    versioning: c.versioning ?? false,
    locales: [...(c.localization ?? [])],
    defaultLocale: c.localization?.[0] ?? null,
    hooks: {
      beforeChange: [...(c.hooks?.beforeChange ?? [])],
      afterChange: [...(c.hooks?.afterChange ?? [])],
      afterPublish: [...(c.hooks?.afterPublish ?? [])],
    },
    titleField: c.titleField ?? firstText,
    singleton: c.singleton ?? false,
  };
}
