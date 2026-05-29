import { environment } from "@zuplo/runtime";
import {
  createRepository,
  type DbProvider,
  type Entity,
  type Repository,
} from "@zuplo/starter-kit-shared/adapters";

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
 * The IncidentUpdate entity. A timeline entry on an incident — the running
 * commentary that customers refresh during an outage. Each update captures
 * the status the incident was in when the update was posted.
 */
export interface IncidentUpdate extends Entity {
  incidentId: string;
  body: string;
  postedAt: string;
  status: "investigating" | "identified" | "monitoring" | "resolved";
}

function build(): Repository<IncidentUpdate> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<IncidentUpdate>({
        provider: "in-memory",
        entityName: "IncidentUpdate",
      });
    case "supabase":
      return createRepository<IncidentUpdate>({
        provider: "supabase",
        entityName: "IncidentUpdate",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_UPDATES_TABLE ?? "incident_updates",
        },
      });
    case "firestore":
      return createRepository<IncidentUpdate>({
        provider: "firestore",
        entityName: "IncidentUpdate",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection:
            environment.FIRESTORE_UPDATES_COLLECTION ?? "incident_updates",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<IncidentUpdate>({
        provider: "upstash-redis",
        entityName: "IncidentUpdate",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix:
            environment.UPSTASH_UPDATES_KEY_PREFIX ?? "incident_updates",
        },
      });
    case "neon":
      return createRepository<IncidentUpdate>({
        provider: "neon",
        entityName: "IncidentUpdate",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_UPDATES_TABLE ?? "incident_updates",
        },
      });
    case "clickhouse":
      return createRepository<IncidentUpdate>({
        provider: "clickhouse",
        entityName: "IncidentUpdate",
        clickhouse: {
          url: requireEnv("CLICKHOUSE_URL"),
          username: requireEnv("CLICKHOUSE_USERNAME"),
          password: requireEnv("CLICKHOUSE_PASSWORD"),
          database: requireEnv("CLICKHOUSE_DATABASE"),
          table: environment.CLICKHOUSE_UPDATES_TABLE ?? "incident_updates",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const incidentUpdateRepository: Repository<IncidentUpdate> = build();
