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
 * A geographic / segment Territory — the candidate pool of reps for a
 * matching lead.
 */
export interface Territory extends Entity {
  name: string;
  criteria: Record<string, unknown>;
  repEmails: string[];
}

function build(): Repository<Territory> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Territory>({ provider: "in-memory", entityName: "Territory" });
    case "supabase":
      return createRepository<Territory>({
        provider: "supabase",
        entityName: "Territory",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_TERRITORIES_TABLE ?? "territories",
        },
      });
    case "firestore":
      return createRepository<Territory>({
        provider: "firestore",
        entityName: "Territory",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_TERRITORIES_COLLECTION ?? "territories",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Territory>({
        provider: "upstash-redis",
        entityName: "Territory",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_TERRITORIES_PREFIX ?? "territories",
        },
      });
    case "neon":
      return createRepository<Territory>({
        provider: "neon",
        entityName: "Territory",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_TERRITORIES_TABLE ?? "territories",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const territoryRepository: Repository<Territory> = build();
