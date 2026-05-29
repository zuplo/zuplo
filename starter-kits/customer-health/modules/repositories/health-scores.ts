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
 * A computed health score for an account at a point in time. Scores are
 * append-only — `recalculate_health` writes a new row instead of mutating
 * the previous one, which gives you an audit trail and a trend series.
 */
export interface HealthScore extends Entity {
  accountId: string;
  scoreValue: number;
  computedAt: string;
  tier: "green" | "yellow" | "red";
  drivers: Array<{ factor: string; weight: number; value: number }>;
}

function build(): Repository<HealthScore> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<HealthScore>({
        provider: "in-memory",
        entityName: "HealthScore",
      });
    case "supabase":
      return createRepository<HealthScore>({
        provider: "supabase",
        entityName: "HealthScore",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_HEALTH_SCORES_TABLE ?? "health_scores",
        },
      });
    case "firestore":
      return createRepository<HealthScore>({
        provider: "firestore",
        entityName: "HealthScore",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_HEALTH_SCORES_COLLECTION ?? "health_scores",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<HealthScore>({
        provider: "upstash-redis",
        entityName: "HealthScore",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_HEALTH_SCORES_PREFIX ?? "health_scores",
        },
      });
    case "neon":
      return createRepository<HealthScore>({
        provider: "neon",
        entityName: "HealthScore",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_HEALTH_SCORES_TABLE ?? "health_scores",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const healthScoreRepository: Repository<HealthScore> = build();
