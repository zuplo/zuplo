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
 * The Project entity. A container for a set of Tasks. Status is the
 * project's lifecycle, distinct from any individual task's status.
 */
export interface Project extends Entity {
  slug: string;
  name: string;
  ownerEmail: string;
  status: "active" | "on_hold" | "completed" | "archived";
  startDate: string | null;
  dueDate: string | null;
  createdAt: string;
}

function build(): Repository<Project> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Project>({
        provider: "in-memory",
        entityName: "Project",
      });
    case "supabase":
      return createRepository<Project>({
        provider: "supabase",
        entityName: "Project",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_PROJECTS_TABLE ?? "projects",
        },
      });
    case "firestore":
      return createRepository<Project>({
        provider: "firestore",
        entityName: "Project",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_PROJECTS_COLLECTION ?? "projects",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Project>({
        provider: "upstash-redis",
        entityName: "Project",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_PROJECTS_KEY_PREFIX ?? "projects",
        },
      });
    case "neon":
      return createRepository<Project>({
        provider: "neon",
        entityName: "Project",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_PROJECTS_TABLE ?? "projects",
        },
      });
    case "clickhouse":
      return createRepository<Project>({
        provider: "clickhouse",
        entityName: "Project",
        clickhouse: {
          url: requireEnv("CLICKHOUSE_URL"),
          username: requireEnv("CLICKHOUSE_USERNAME"),
          password: requireEnv("CLICKHOUSE_PASSWORD"),
          database: requireEnv("CLICKHOUSE_DATABASE"),
          table: environment.CLICKHOUSE_PROJECTS_TABLE ?? "projects",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const projectRepository: Repository<Project> = build();
