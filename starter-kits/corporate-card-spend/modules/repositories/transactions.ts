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
 * A card transaction posted by the issuer network.
 */
export interface Transaction extends Entity {
  cardId: string;
  amountCents: number;
  currency: string;
  merchantName: string;
  mcc: string;
  postedAt: string;
  category: string | null;
  glCode: string | null;
  memo: string | null;
  status: "pending" | "posted" | "declined" | "disputed";
  coded: boolean;
}

function build(): Repository<Transaction> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Transaction>({ provider: "in-memory", entityName: "Transaction" });
    case "supabase":
      return createRepository<Transaction>({
        provider: "supabase",
        entityName: "Transaction",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_TRANSACTIONS_TABLE ?? "transactions",
        },
      });
    case "firestore":
      return createRepository<Transaction>({
        provider: "firestore",
        entityName: "Transaction",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_TRANSACTIONS_COLLECTION ?? "transactions",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Transaction>({
        provider: "upstash-redis",
        entityName: "Transaction",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_TRANSACTIONS_PREFIX ?? "transactions",
        },
      });
    case "neon":
      return createRepository<Transaction>({
        provider: "neon",
        entityName: "Transaction",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_TRANSACTIONS_TABLE ?? "transactions",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const transactionRepository: Repository<Transaction> = build();
