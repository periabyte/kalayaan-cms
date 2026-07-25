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
  type GraphQLFieldConfig,
  type GraphQLOutputType,
} from "graphql";
import type { ResolvedCollection, ResolvedConfig } from "@kalayaan/config";
import type { DatabaseAdapter } from "@kalayaan/core";
import { MAX_LIMIT } from "@kalayaan/core";

export interface GraphQLContext {
  adapter: DatabaseAdapter;
}

/** Opaque JSON scalar for rich-text (ProseMirror) field values. */
const JSONScalar = new GraphQLScalarType({
  name: "JSON",
  description: "Arbitrary JSON value (rich-text document tree).",
  serialize: (v) => v,
  parseValue: (v) => v,
});

function outputType(collectionField: { def: { type: string; integer?: boolean; many?: boolean } }): GraphQLOutputType {
  const def = collectionField.def;
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
    case "relation":
    case "media":
      // A single media/relation is an id string; `many` is an ordered id list.
      return def.many ? new GraphQLList(new GraphQLNonNull(GraphQLString)) : GraphQLString;
    default:
      // text, slug, select
      return GraphQLString;
  }
}

function collectionObjectType(collection: ResolvedCollection): GraphQLObjectType {
  return new GraphQLObjectType({
    name: typeName(collection.name),
    fields: () => {
      const fields: Record<string, GraphQLFieldConfig<Record<string, unknown>, GraphQLContext>> = {
        id: { type: new GraphQLNonNull(GraphQLID) },
        created_at: { type: GraphQLFloat },
        updated_at: { type: GraphQLFloat },
        published_at: { type: GraphQLFloat },
      };
      if (collection.locales.length > 0) {
        fields.entity_id = { type: GraphQLString };
        fields.locale = { type: GraphQLString };
      }
      for (const f of collection.fields) fields[f.name] = { type: outputType(f) };
      return fields;
    },
  });
}

/**
 * Build a read-only GraphQL schema from the resolved config. Each collection
 * gets an object type, a `<name>` list query (published only, paginated by
 * limit), and a `<name>_one(id|slug, locale)` single query. Resolvers reuse the
 * DatabaseAdapter, so GraphQL is exact parity with the REST content API's
 * published-only visibility.
 */
export function buildGraphQLSchema(config: ResolvedConfig): GraphQLSchema {
  const types = new Map(config.collections.map((c) => [c.name, collectionObjectType(c)]));
  const queryFields: Record<string, GraphQLFieldConfig<unknown, GraphQLContext>> = {};

  for (const collection of config.collections) {
    const type = types.get(collection.name)!;

    queryFields[collection.name] = {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(type))),
      args: {
        limit: { type: GraphQLInt },
        locale: { type: GraphQLString },
      },
      resolve: async (_src, args: { limit?: number; locale?: string }, ctx) => {
        const limit = Math.min(Math.max(args.limit ?? 20, 1), MAX_LIMIT);
        const page = await ctx.adapter.find({
          collection: collection.name,
          where: { published_at: { ne: null, lte: Date.now() } },
          ...(args.locale && { locale: args.locale }),
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
      resolve: async (_src, args: { id?: string; slug?: string; locale?: string }, ctx) => {
        if (!args.id && !args.slug) return null;
        const doc = await ctx.adapter.findOne({
          collection: collection.name,
          ...(args.id ? { id: args.id } : { slug: args.slug! }),
          ...(args.locale && { locale: args.locale }),
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
