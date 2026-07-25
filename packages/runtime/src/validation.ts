import { z } from "zod";
import type { FieldDef, ResolvedCollection } from "@kalayaan/config";

/** Builds a Zod schema for a collection's writable body from its field defs. */
export function collectionWriteSchema(c: ResolvedCollection, opts: { partial: boolean }) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const { name, def } of c.fields) shape[name] = fieldSchema(def);
  if (c.locales.length > 0) shape.locale = z.enum(c.locales as [string, ...string[]]).optional();
  shape.entity_id = z.string().optional();
  shape.published_at = z.number().int().nullable().optional();

  let schema = z.object(shape).strict();
  if (opts.partial) schema = schema.partial() as unknown as typeof schema;
  return schema;
}

function fieldSchema(def: FieldDef): z.ZodTypeAny {
  let base: z.ZodTypeAny;
  switch (def.type) {
    case "text": {
      let s = def.required ? z.string().min(1, "required") : z.string();
      if (def.maxLength) s = s.max(def.maxLength);
      base = s;
      break;
    }
    case "slug":
      base = z
        .string()
        .min(1, "required")
        .regex(/^[a-z0-9-]+$/, "slugs are lowercase letters, numbers, and hyphens");
      break;
    case "richText":
      base = z.unknown();
      break;
    case "media":
      base = def.many ? z.array(z.string()) : z.string().nullable();
      break;
    case "relation":
      base = def.many ? z.array(z.string()) : z.string().nullable();
      break;
    case "select":
      base = z.enum(def.options as [string, ...string[]]);
      break;
    case "number":
      base = def.integer ? z.number().int() : z.number();
      break;
    case "boolean":
      base = z.boolean();
      break;
    case "date":
      base = z.number().int();
      break;
    case "custom":
      // Accept anything at the Zod layer; the plugin's registered validator
      // (applied in the write path) owns the real shape.
      base = z.unknown();
      break;
  }
  return def.required ? base : base.optional();
}
