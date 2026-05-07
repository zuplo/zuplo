/**
 * Build a minimal valid sample object from a JSON Schema. Walks the `required`
 * list and emits placeholder values typed correctly. Optional fields are
 * omitted unless they appear in `required`.
 *
 * Used by the functional test suite to drive create_* handlers without
 * hand-crafting per-kit fixtures.
 */

interface Schema {
  type?: string | string[];
  format?: string;
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, Schema>;
  items?: Schema;
  $ref?: string;
  minimum?: number;
  minLength?: number;
  oneOf?: Schema[];
  anyOf?: Schema[];
}

interface Components {
  schemas?: Record<string, Schema>;
}

export function sampleFromSchema(schema: Schema, components?: Components): unknown {
  return walk(schema, components, new Set());
}

function walk(schema: Schema, components: Components | undefined, seen: Set<string>): unknown {
  if (schema.$ref) {
    const ref = schema.$ref;
    if (seen.has(ref)) return null;
    seen.add(ref);
    const match = ref.match(/^#\/components\/schemas\/(.+)$/);
    if (!match) return null;
    const target = components?.schemas?.[match[1]];
    if (!target) return null;
    return walk(target, components, seen);
  }

  if (schema.oneOf?.length) return walk(schema.oneOf[0], components, seen);
  if (schema.anyOf?.length) return walk(schema.anyOf[0], components, seen);

  if (schema.enum?.length) return schema.enum[0];

  const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== "null") : schema.type;

  switch (type) {
    case "string":
      return sampleString(schema);
    case "integer":
    case "number":
      return schema.minimum ?? 0;
    case "boolean":
      return false;
    case "array":
      return [];
    case "object": {
      const out: Record<string, unknown> = {};
      const props = schema.properties ?? {};
      for (const key of schema.required ?? []) {
        const child = props[key];
        if (!child) continue;
        out[key] = walk(child, components, new Set(seen));
      }
      return out;
    }
    default:
      return null;
  }
}

function sampleString(schema: Schema): string {
  switch (schema.format) {
    case "email":
      return "test@example.com";
    case "date":
      return "2026-01-01";
    case "date-time":
      return "2026-01-01T00:00:00Z";
    case "uuid":
      return "00000000-0000-0000-0000-000000000000";
    case "uri":
    case "url":
      return "https://example.com";
    default:
      return "sample";
  }
}
