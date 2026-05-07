import { environment } from "@zuplo/runtime";
import {
  createRepository,
  type DbProvider,
  type Entity,
  type Repository,
} from "../_shared/adapters/index.ts";

function requireEnv(name: string): string {
  const value = (environment as Record<string, string | undefined>)[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

/**
 * The product catalog — every line item references a Product. List price
 * is the un-discounted price; the recurring interval drives ARR math.
 */
export interface Product extends Entity {
  sku: string;
  name: string;
  listPriceCents: number;
  recurringInterval: "one_time" | "monthly" | "yearly";
  category: string;
  active: boolean;
}

function build(): Repository<Product> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Product>({ provider: "in-memory", entityName: "Product" });
    case "supabase":
      return createRepository<Product>({
        provider: "supabase",
        entityName: "Product",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_PRODUCTS_TABLE ?? "products",
        },
      });
    case "firestore":
      return createRepository<Product>({
        provider: "firestore",
        entityName: "Product",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_PRODUCTS_COLLECTION ?? "products",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Product>({
        provider: "upstash-redis",
        entityName: "Product",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_PRODUCTS_PREFIX ?? "products",
        },
      });
    case "neon":
      return createRepository<Product>({
        provider: "neon",
        entityName: "Product",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_PRODUCTS_TABLE ?? "products",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const productRepository: Repository<Product> = build();
