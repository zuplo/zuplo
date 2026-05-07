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
 * A leading-indicator signal — usage drop, ticket spike, NPS dip, etc.
 * Signals feed both the health score driver list and the playbook trigger
 * matcher.
 */
export interface Signal extends Entity {
  accountId: string;
  kind:
    | "usage_drop"
    | "ticket_spike"
    | "nps_drop"
    | "login_drop"
    | "feature_unused"
    | "champion_left";
  severity: "low" | "med" | "high";
  detectedAt: string;
  value: number;
}

function build(): Repository<Signal> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Signal>({
        provider: "in-memory",
        entityName: "Signal",
      });
    case "supabase":
      return createRepository<Signal>({
        provider: "supabase",
        entityName: "Signal",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_SIGNALS_TABLE ?? "signals",
        },
      });
    case "firestore":
      return createRepository<Signal>({
        provider: "firestore",
        entityName: "Signal",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_SIGNALS_COLLECTION ?? "signals",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Signal>({
        provider: "upstash-redis",
        entityName: "Signal",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_SIGNALS_PREFIX ?? "signals",
        },
      });
    case "neon":
      return createRepository<Signal>({
        provider: "neon",
        entityName: "Signal",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_SIGNALS_TABLE ?? "signals",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const signalRepository: Repository<Signal> = build();
