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

/** A rep's quota for a period. */
export interface Quota extends Entity {
  repEmail: string;
  period: string;
  quotaCents: number;
}

function build(): Repository<Quota> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Quota>({ provider: "in-memory", entityName: "Quota" });
    case "supabase":
      return createRepository<Quota>({
        provider: "supabase",
        entityName: "Quota",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_QUOTAS_TABLE ?? "quotas",
        },
      });
    case "firestore":
      return createRepository<Quota>({
        provider: "firestore",
        entityName: "Quota",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_QUOTAS_COLLECTION ?? "quotas",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Quota>({
        provider: "upstash-redis",
        entityName: "Quota",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_QUOTAS_PREFIX ?? "quotas",
        },
      });
    case "neon":
      return createRepository<Quota>({
        provider: "neon",
        entityName: "Quota",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_QUOTAS_TABLE ?? "quotas",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const quotaRepository: Repository<Quota> = build();
