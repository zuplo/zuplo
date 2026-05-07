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
 * The Task entity. The atomic unit of work in a Project. Status is the
 * Kanban column the task lives in; priority drives sort and SLAs.
 */
export interface Task extends Entity {
  projectId: string;
  title: string;
  description: string;
  assigneeEmail: string | null;
  priority: "low" | "med" | "high" | "urgent";
  status: "todo" | "doing" | "blocked" | "done";
  dueDate: string | null;
  completedAt: string | null;
  parentTaskId: string | null;
  customFields: Record<string, unknown>;
  labels: string[];
  estimateHours: number | null;
  createdAt: string;
  updatedAt: string;
}

function build(): Repository<Task> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Task>({
        provider: "in-memory",
        entityName: "Task",
      });
    case "supabase":
      return createRepository<Task>({
        provider: "supabase",
        entityName: "Task",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_TASKS_TABLE ?? "tasks",
        },
      });
    case "firestore":
      return createRepository<Task>({
        provider: "firestore",
        entityName: "Task",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_TASKS_COLLECTION ?? "tasks",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Task>({
        provider: "upstash-redis",
        entityName: "Task",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_TASKS_KEY_PREFIX ?? "tasks",
        },
      });
    case "neon":
      return createRepository<Task>({
        provider: "neon",
        entityName: "Task",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_TASKS_TABLE ?? "tasks",
        },
      });
    case "clickhouse":
      return createRepository<Task>({
        provider: "clickhouse",
        entityName: "Task",
        clickhouse: {
          url: requireEnv("CLICKHOUSE_URL"),
          username: requireEnv("CLICKHOUSE_USERNAME"),
          password: requireEnv("CLICKHOUSE_PASSWORD"),
          database: requireEnv("CLICKHOUSE_DATABASE"),
          table: environment.CLICKHOUSE_TASKS_TABLE ?? "tasks",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const taskRepository: Repository<Task> = build();
