import { environment } from "@zuplo/runtime";
import {
  createRepository,
  type DbProvider,
  type Entity,
  type Repository,
} from "../_shared/adapters/index.ts";

function requireEnv(name: string): string {
  const value = (environment as Record<string, string | undefined>)[name];
  if (!value) {
    throw new Error(
      `Missing environment variable: ${name}. Set it in .env or in Zuplo Portal > Settings > Environment Variables.`,
    );
  }
  return value;
}

/**
 * A customer who can place orders.
 */
export interface Customer extends Entity {
  email: string;
  firstName: string;
  lastName: string;
  totalOrders: number;
  totalSpentCents: number;
  vipTier: "none" | "silver" | "gold";
}

function build(): Repository<Customer> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Customer>({ provider: "in-memory", entityName: "Customer" });
    case "supabase":
      return createRepository<Customer>({
        provider: "supabase",
        entityName: "Customer",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_CUSTOMERS_TABLE ?? "customers",
        },
      });
    case "firestore":
      return createRepository<Customer>({
        provider: "firestore",
        entityName: "Customer",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_CUSTOMERS_COLLECTION ?? "customers",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Customer>({
        provider: "upstash-redis",
        entityName: "Customer",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_CUSTOMERS_PREFIX ?? "customers",
        },
      });
    case "neon":
      return createRepository<Customer>({
        provider: "neon",
        entityName: "Customer",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_CUSTOMERS_TABLE ?? "customers",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const customerRepository: Repository<Customer> = build();
