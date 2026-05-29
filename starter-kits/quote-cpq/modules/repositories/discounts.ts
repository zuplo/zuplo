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
 * A manual discount applied to a quote. Tracks who applied it and why,
 * for audit trail + approval routing.
 */
export interface Discount extends Entity {
  quoteId: string;
  kind: "percent" | "flat";
  value: number;
  reason: string;
  appliedBy: string;
  appliedAt: string;
}

function build(): Repository<Discount> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Discount>({ provider: "in-memory", entityName: "Discount" });
    case "supabase":
      return createRepository<Discount>({
        provider: "supabase",
        entityName: "Discount",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_DISCOUNTS_TABLE ?? "discounts",
        },
      });
    case "firestore":
      return createRepository<Discount>({
        provider: "firestore",
        entityName: "Discount",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_DISCOUNTS_COLLECTION ?? "discounts",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Discount>({
        provider: "upstash-redis",
        entityName: "Discount",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_DISCOUNTS_PREFIX ?? "discounts",
        },
      });
    case "neon":
      return createRepository<Discount>({
        provider: "neon",
        entityName: "Discount",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_DISCOUNTS_TABLE ?? "discounts",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const discountRepository: Repository<Discount> = build();
