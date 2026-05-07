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
 * The Incident entity. Represents a customer-facing event on the status page.
 * Incidents move through investigating -> identified -> monitoring -> resolved.
 * `kind` distinguishes unplanned incidents from planned maintenance windows.
 */
export interface Incident extends Entity {
  title: string;
  body: string;
  status: "investigating" | "identified" | "monitoring" | "resolved";
  impact: "none" | "minor" | "major" | "critical";
  affectedComponentSlugs: string[];
  startedAt: string;
  resolvedAt: string | null;
  kind: "incident" | "maintenance";
  createdAt: string;
}

function build(): Repository<Incident> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Incident>({
        provider: "in-memory",
        entityName: "Incident",
      });
    case "supabase":
      return createRepository<Incident>({
        provider: "supabase",
        entityName: "Incident",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_INCIDENTS_TABLE ?? "incidents",
        },
      });
    case "firestore":
      return createRepository<Incident>({
        provider: "firestore",
        entityName: "Incident",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_INCIDENTS_COLLECTION ?? "incidents",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Incident>({
        provider: "upstash-redis",
        entityName: "Incident",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_INCIDENTS_KEY_PREFIX ?? "incidents",
        },
      });
    case "neon":
      return createRepository<Incident>({
        provider: "neon",
        entityName: "Incident",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_INCIDENTS_TABLE ?? "incidents",
        },
      });
    case "clickhouse":
      return createRepository<Incident>({
        provider: "clickhouse",
        entityName: "Incident",
        clickhouse: {
          url: requireEnv("CLICKHOUSE_URL"),
          username: requireEnv("CLICKHOUSE_USERNAME"),
          password: requireEnv("CLICKHOUSE_PASSWORD"),
          database: requireEnv("CLICKHOUSE_DATABASE"),
          table: environment.CLICKHOUSE_INCIDENTS_TABLE ?? "incidents",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const incidentRepository: Repository<Incident> = build();
