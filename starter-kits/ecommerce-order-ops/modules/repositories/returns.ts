import { environment } from "@zuplo/runtime";
import {
  createRepository,
  type DbProvider,
  type Entity,
  type Repository,
} from "@zuplo/starter-kit-shared/adapters";

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
 * A return request opened against a specific line item on an order.
 */
export interface Return extends Entity {
  orderId: string;
  lineItemId: string;
  quantity: number;
  reason: string;
  status: "requested" | "approved" | "received" | "refunded" | "rejected";
  requestedAt: string;
  refundedAt: string | null;
}

function build(): Repository<Return> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Return>({ provider: "in-memory", entityName: "Return" });
    case "supabase":
      return createRepository<Return>({
        provider: "supabase",
        entityName: "Return",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_RETURNS_TABLE ?? "returns",
        },
      });
    case "firestore":
      return createRepository<Return>({
        provider: "firestore",
        entityName: "Return",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_RETURNS_COLLECTION ?? "returns",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Return>({
        provider: "upstash-redis",
        entityName: "Return",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_RETURNS_PREFIX ?? "returns",
        },
      });
    case "neon":
      return createRepository<Return>({
        provider: "neon",
        entityName: "Return",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_RETURNS_TABLE ?? "returns",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const returnRepository: Repository<Return> = build();
