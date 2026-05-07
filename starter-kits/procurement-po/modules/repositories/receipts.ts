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

/** A receiving record against a PurchaseOrder. */
export interface Receipt extends Entity {
  poId: string;
  receivedAt: string;
  receivedBy: string;
  allItemsReceived: boolean;
  partialAmountCents: number | null;
}

function build(): Repository<Receipt> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Receipt>({ provider: "in-memory", entityName: "Receipt" });
    case "supabase":
      return createRepository<Receipt>({
        provider: "supabase",
        entityName: "Receipt",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_RECEIPTS_TABLE ?? "receipts",
        },
      });
    case "firestore":
      return createRepository<Receipt>({
        provider: "firestore",
        entityName: "Receipt",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_RECEIPTS_COLLECTION ?? "receipts",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Receipt>({
        provider: "upstash-redis",
        entityName: "Receipt",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_RECEIPTS_PREFIX ?? "receipts",
        },
      });
    case "neon":
      return createRepository<Receipt>({
        provider: "neon",
        entityName: "Receipt",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_RECEIPTS_TABLE ?? "receipts",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const receiptRepository: Repository<Receipt> = build();
