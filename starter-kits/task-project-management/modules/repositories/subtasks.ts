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
 * The Subtask entity. A simple checklist item under a parent Task.
 * Lighter than a full Task — no assignees, priority, or due dates.
 */
export interface Subtask extends Entity {
  parentTaskId: string;
  title: string;
  status: "todo" | "done";
  completedAt: string | null;
  createdAt: string;
}

function build(): Repository<Subtask> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Subtask>({
        provider: "in-memory",
        entityName: "Subtask",
      });
    case "supabase":
      return createRepository<Subtask>({
        provider: "supabase",
        entityName: "Subtask",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_SUBTASKS_TABLE ?? "subtasks",
        },
      });
    case "firestore":
      return createRepository<Subtask>({
        provider: "firestore",
        entityName: "Subtask",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_SUBTASKS_COLLECTION ?? "subtasks",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Subtask>({
        provider: "upstash-redis",
        entityName: "Subtask",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_SUBTASKS_KEY_PREFIX ?? "subtasks",
        },
      });
    case "neon":
      return createRepository<Subtask>({
        provider: "neon",
        entityName: "Subtask",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_SUBTASKS_TABLE ?? "subtasks",
        },
      });
    case "clickhouse":
      return createRepository<Subtask>({
        provider: "clickhouse",
        entityName: "Subtask",
        clickhouse: {
          url: requireEnv("CLICKHOUSE_URL"),
          username: requireEnv("CLICKHOUSE_USERNAME"),
          password: requireEnv("CLICKHOUSE_PASSWORD"),
          database: requireEnv("CLICKHOUSE_DATABASE"),
          table: environment.CLICKHOUSE_SUBTASKS_TABLE ?? "subtasks",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const subtaskRepository: Repository<Subtask> = build();
