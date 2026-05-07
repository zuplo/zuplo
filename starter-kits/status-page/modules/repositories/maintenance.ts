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
 * The Maintenance entity. A scheduled maintenance window that is announced
 * to subscribers ahead of time. Distinct from an Incident, but both end up on
 * the public timeline.
 */
export interface Maintenance extends Entity {
  title: string;
  scheduledStart: string;
  scheduledEnd: string;
  affectedComponentSlugs: string[];
  status: "scheduled" | "in_progress" | "completed" | "canceled";
  createdAt: string;
}

function build(): Repository<Maintenance> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Maintenance>({
        provider: "in-memory",
        entityName: "Maintenance",
      });
    case "supabase":
      return createRepository<Maintenance>({
        provider: "supabase",
        entityName: "Maintenance",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_MAINTENANCE_TABLE ?? "maintenance",
        },
      });
    case "firestore":
      return createRepository<Maintenance>({
        provider: "firestore",
        entityName: "Maintenance",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection:
            environment.FIRESTORE_MAINTENANCE_COLLECTION ?? "maintenance",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Maintenance>({
        provider: "upstash-redis",
        entityName: "Maintenance",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix:
            environment.UPSTASH_MAINTENANCE_KEY_PREFIX ?? "maintenance",
        },
      });
    case "neon":
      return createRepository<Maintenance>({
        provider: "neon",
        entityName: "Maintenance",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_MAINTENANCE_TABLE ?? "maintenance",
        },
      });
    case "clickhouse":
      return createRepository<Maintenance>({
        provider: "clickhouse",
        entityName: "Maintenance",
        clickhouse: {
          url: requireEnv("CLICKHOUSE_URL"),
          username: requireEnv("CLICKHOUSE_USERNAME"),
          password: requireEnv("CLICKHOUSE_PASSWORD"),
          database: requireEnv("CLICKHOUSE_DATABASE"),
          table: environment.CLICKHOUSE_MAINTENANCE_TABLE ?? "maintenance",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const maintenanceRepository: Repository<Maintenance> = build();
