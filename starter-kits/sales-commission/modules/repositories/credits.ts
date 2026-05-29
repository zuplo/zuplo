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
 * A Credit — a deal credit assigned to a rep for a period. Splits are
 * supported via splitPercent (e.g. AE/SE/manager).
 */
export interface Credit extends Entity {
  repEmail: string;
  dealId: string;
  amountCents: number;
  period: string;
  splitPercent: number;
  creditedAt: string;
  dealStatus?: string;
}

function build(): Repository<Credit> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Credit>({ provider: "in-memory", entityName: "Credit" });
    case "supabase":
      return createRepository<Credit>({
        provider: "supabase",
        entityName: "Credit",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_CREDITS_TABLE ?? "credits",
        },
      });
    case "firestore":
      return createRepository<Credit>({
        provider: "firestore",
        entityName: "Credit",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_CREDITS_COLLECTION ?? "credits",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Credit>({
        provider: "upstash-redis",
        entityName: "Credit",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_CREDITS_PREFIX ?? "credits",
        },
      });
    case "neon":
      return createRepository<Credit>({
        provider: "neon",
        entityName: "Credit",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_CREDITS_TABLE ?? "credits",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const creditRepository: Repository<Credit> = build();
