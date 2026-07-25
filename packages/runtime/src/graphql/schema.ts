import {
  GraphQLBoolean,
  GraphQLFloat,
  GraphQLID,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLScalarType,
  GraphQLSchema,
  GraphQLString,
  Kind,
  type GraphQLFieldConfig,
  type GraphQLObjectType as ObjectType,
  type GraphQLOutputType,
  type GraphQLResolveInfo,
  type SelectionSetNode,
} from "graphql";
import type { FieldDef, ResolvedCollection, ResolvedConfig } from "@kalayaan/config";
import type { DatabaseAdapter } from "@kalayaan/core";
import { MAX_LIMIT } from "@kalayaan/core";

export interface GraphQLContext {
  adapter: DatabaseAdapter;
}

type Doc = Record<string, unknown>;
type CollectionTypes = Map<string, ObjectType>;

/** Opaque JSON scalar for rich-text (ProseMirror) field values. */
const JSONScalar = new GraphQLScalarType({
  name: "JSON",
  description: "Arbitrary JSON value (rich-text document tree).",
  serialize: (v) => v,
  parseValue: (v) => v,
});

/** The shape of a populated media asset — the `media` system table row plus a `url`. */
function mediaObjectType(): ObjectType {
  return new GraphQLObjectType<Doc, GraphQLContext>({
    name: "Media",
    fields: {
      id: { type: new GraphQLNonNull(GraphQLID) },
      url: { type: GraphQLString, resolve: (src) => (src.id ? `/media/${String(src.id)}` : null) },
      filename: { type: GraphQLString },
      mime: { type: GraphQLString },
      size: { type: GraphQLInt },
      width: { type: GraphQLInt },
      height: { type: GraphQLInt },
      alt: { type: GraphQLString },
      created_at: { type: GraphQLFloat },
    },
  });
}

/** GraphQL type for a scalar (non-relational) field. */
function scalarType(def: FieldDef): GraphQLOutputType {
  switch (def.type) {
    case "number":
      return def.integer ? GraphQLInt : GraphQLFloat;
    case "boolean":
      return GraphQLBoolean;
    case "date":
      return GraphQLFloat;
    case "richText":
    case "custom":
      return JSONScalar;
    default:
      // text, slug, select
      return GraphQLString;
  }
}

/**
 * Only an object value counts as "populated" — a bare id string (an unpopulated
 * relation, or a depth-2 relation we don't resolve) reads as null/[] rather than
 * letting GraphQL try to resolve subfields on a string.
 */
const populated = (v: unknown): v is Doc => v != null && typeof v === "object";

/** Field config for one collection field: a nested object type for relation/media, else a scalar. */
function fieldConfig(
  f: { name: string; def: FieldDef },
  types: CollectionTypes,
  media: ObjectType,
): GraphQLFieldConfig<Doc, GraphQLContext> {
  const { def, name } = f;
  if (def.type === "relation" || def.type === "media") {
    const target = def.type === "media" ? media : (types.get(def.to) ?? null);
    // A missing relation target shouldn't happen (config validates it); fall back to the id string.
    if (!target) return { type: def.many ? new GraphQLList(new GraphQLNonNull(GraphQLString)) : GraphQLString };
    return def.many
      ? {
          type: new GraphQLList(new GraphQLNonNull(target)),
          resolve: (src) => (Array.isArray(src[name]) ? (src[name] as unknown[]).filter(populated) : []),
        }
      : {
          type: target,
          resolve: (src) => (populated(src[name]) ? src[name] : null),
        };
  }
  return { type: scalarType(def) };
}

function collectionFields(
  collection: ResolvedCollection,
  types: CollectionTypes,
  media: ObjectType,
): Record<string, GraphQLFieldConfig<Doc, GraphQLContext>> {
  const fields: Record<string, GraphQLFieldConfig<Doc, GraphQLContext>> = {
    id: { type: new GraphQLNonNull(GraphQLID) },
    created_at: { type: GraphQLFloat },
    updated_at: { type: GraphQLFloat },
    published_at: { type: GraphQLFloat },
  };
  if (collection.locales.length > 0) {
    fields.entity_id = { type: GraphQLString };
    fields.locale = { type: GraphQLString };
  }
  for (const f of collection.fields) fields[f.name] = fieldConfig(f, types, media);
  return fields;
}

/**
 * Which relation/media fields the query selected on this collection — passed to
 * the adapter as `populate` so exactly the requested relations are resolved into
 * nested objects (depth 1), and no others. Handles inline fragments and spreads.
 */
function requestedPopulate(info: GraphQLResolveInfo, collection: ResolvedCollection): string[] {
  const relational = new Set(
    collection.fields.filter((f) => f.def.type === "relation" || f.def.type === "media").map((f) => f.name),
  );
  const found = new Set<string>();
  const visit = (set: SelectionSetNode | undefined): void => {
    if (!set) return;
    for (const sel of set.selections) {
      if (sel.kind === Kind.FIELD) {
        if (relational.has(sel.name.value)) found.add(sel.name.value);
      } else if (sel.kind === Kind.INLINE_FRAGMENT) {
        visit(sel.selectionSet);
      } else if (sel.kind === Kind.FRAGMENT_SPREAD) {
        visit(info.fragments[sel.name.value]?.selectionSet);
      }
    }
  };
  for (const node of info.fieldNodes) visit(node.selectionSet);
  return [...found];
}

/**
 * Build a read-only GraphQL schema from the resolved config. Each collection
 * gets an object type, a `<name>` list query (published only, paginated by
 * limit), and a `<name>_one(id|slug, locale)` single query. Relation and media
 * fields resolve into nested object types — the adapter populates exactly the
 * fields the query selects (depth 1). Resolvers reuse the DatabaseAdapter, so
 * GraphQL keeps exact parity with the REST content API's published-only visibility.
 */
export function buildGraphQLSchema(config: ResolvedConfig): GraphQLSchema {
  const media = mediaObjectType();
  const types: CollectionTypes = new Map();
  // Create every collection type up front so relation fields can reference each
  // other; the lazy `fields` thunk reads `types` after the map is fully built.
  for (const c of config.collections) {
    types.set(
      c.name,
      new GraphQLObjectType<Doc, GraphQLContext>({
        name: typeName(c.name),
        fields: () => collectionFields(c, types, media),
      }),
    );
  }

  const queryFields: Record<string, GraphQLFieldConfig<unknown, GraphQLContext>> = {};

  for (const collection of config.collections) {
    const type = types.get(collection.name)!;

    queryFields[collection.name] = {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(type))),
      args: {
        limit: { type: GraphQLInt },
        locale: { type: GraphQLString },
      },
      resolve: async (_src, args: { limit?: number; locale?: string }, ctx, info) => {
        const limit = Math.min(Math.max(args.limit ?? 20, 1), MAX_LIMIT);
        const populate = requestedPopulate(info, collection);
        const page = await ctx.adapter.find({
          collection: collection.name,
          where: { published_at: { ne: null, lte: Date.now() } },
          ...(args.locale && { locale: args.locale }),
          ...(populate.length && { populate }),
          limit,
        });
        return page.docs;
      },
    };

    queryFields[`${collection.name}_one`] = {
      type,
      args: {
        id: { type: GraphQLID },
        slug: { type: GraphQLString },
        locale: { type: GraphQLString },
      },
      resolve: async (_src, args: { id?: string; slug?: string; locale?: string }, ctx, info) => {
        if (!args.id && !args.slug) return null;
        const populate = requestedPopulate(info, collection);
        const doc = await ctx.adapter.findOne({
          collection: collection.name,
          ...(args.id ? { id: args.id } : { slug: args.slug! }),
          ...(args.locale && { locale: args.locale }),
          ...(populate.length && { populate }),
        });
        if (!doc || doc.published_at === null || (doc.published_at as number) > Date.now()) return null;
        return doc;
      },
    };
  }

  return new GraphQLSchema({
    query: new GraphQLObjectType({ name: "Query", fields: queryFields }),
  });
}

function typeName(collection: string): string {
  return collection
    .split(/[_-]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}
