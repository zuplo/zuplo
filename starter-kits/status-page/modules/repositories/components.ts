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
 * The Component entity. Represents a single service or subsystem displayed
 * on the public status page (e.g. "API", "Dashboard", "Webhooks"). Components
 * can be nested under a parentSlug to model groupings.
 */
export interface Component extends Entity {
  slug: string;
  name: string;
  status:
    | "operational"
    | "degraded"
    | "partial_outage"
    | "major_outage"
    | "under_maintenance";
  description: string;
  parentSlug: string | null;
  displayOrder: number;
  updatedAt: string;
}

function build(): Repository<Component> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Component>({
        provider: "in-memory",
        entityName: "Component",
      });
    case "supabase":
      return createRepository<Component>({
        provider: "supabase",
        entityName: "Component",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_COMPONENTS_TABLE ?? "components",
        },
      });
    case "firestore":
      return createRepository<Component>({
        provider: "firestore",
        entityName: "Component",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection:
            environment.FIRESTORE_COMPONENTS_COLLECTION ?? "components",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Component>({
        provider: "upstash-redis",
        entityName: "Component",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_COMPONENTS_KEY_PREFIX ?? "components",
        },
      });
    case "neon":
      return createRepository<Component>({
        provider: "neon",
        entityName: "Component",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_COMPONENTS_TABLE ?? "components",
        },
      });
    case "clickhouse":
      return createRepository<Component>({
        provider: "clickhouse",
        entityName: "Component",
        clickhouse: {
          url: requireEnv("CLICKHOUSE_URL"),
          username: requireEnv("CLICKHOUSE_USERNAME"),
          password: requireEnv("CLICKHOUSE_PASSWORD"),
          database: requireEnv("CLICKHOUSE_DATABASE"),
          table: environment.CLICKHOUSE_COMPONENTS_TABLE ?? "components",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const componentRepository: Repository<Component> = build();
