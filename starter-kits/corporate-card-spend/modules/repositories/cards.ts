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
 * A corporate card issued to an employee.
 */
export interface Card extends Entity {
  employeeEmail: string;
  last4: string;
  status: "active" | "frozen" | "canceled";
  spendLimitCents: number;
  intervalDays: number;
  currentSpendCents: number;
  createdAt: string;
}

function build(): Repository<Card> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Card>({ provider: "in-memory", entityName: "Card" });
    case "supabase":
      return createRepository<Card>({
        provider: "supabase",
        entityName: "Card",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_CARDS_TABLE ?? "cards",
        },
      });
    case "firestore":
      return createRepository<Card>({
        provider: "firestore",
        entityName: "Card",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_CARDS_COLLECTION ?? "cards",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Card>({
        provider: "upstash-redis",
        entityName: "Card",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_CARDS_PREFIX ?? "cards",
        },
      });
    case "neon":
      return createRepository<Card>({
        provider: "neon",
        entityName: "Card",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_CARDS_TABLE ?? "cards",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const cardRepository: Repository<Card> = build();
