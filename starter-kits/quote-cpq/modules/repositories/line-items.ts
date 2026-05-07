import { environment } from "@zuplo/runtime";
import {
  createRepository,
  type DbProvider,
  type Entity,
  type Repository,
} from "@zuplo/starter-kit-shared/adapters";

function requireEnv(name: string): string {
  const value = (environment as Record<string, string | undefined>)[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

/**
 * A single line on a quote — one product, a quantity, and a calculated
 * line total after any line-level discount.
 */
export interface LineItem extends Entity {
  quoteId: string;
  productId: string;
  quantity: number;
  unitPriceCents: number;
  discountPercent: number;
  totalCents: number;
}

function build(): Repository<LineItem> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<LineItem>({ provider: "in-memory", entityName: "LineItem" });
    case "supabase":
      return createRepository<LineItem>({
        provider: "supabase",
        entityName: "LineItem",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_LINE_ITEMS_TABLE ?? "line_items",
        },
      });
    case "firestore":
      return createRepository<LineItem>({
        provider: "firestore",
        entityName: "LineItem",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_LINE_ITEMS_COLLECTION ?? "line_items",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<LineItem>({
        provider: "upstash-redis",
        entityName: "LineItem",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_LINE_ITEMS_PREFIX ?? "line_items",
        },
      });
    case "neon":
      return createRepository<LineItem>({
        provider: "neon",
        entityName: "LineItem",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_LINE_ITEMS_TABLE ?? "line_items",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const lineItemRepository: Repository<LineItem> = build();
