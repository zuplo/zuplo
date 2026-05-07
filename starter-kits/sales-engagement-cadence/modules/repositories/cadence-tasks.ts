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
 * A CadenceTask — a manual step (call/task) the rep is expected to do at
 * a particular point in the enrollment.
 */
export interface CadenceTask extends Entity {
  enrollmentId: string;
  stepIndex: number;
  dueAt: string;
  kind: "call" | "task";
  status: "pending" | "completed" | "skipped";
}

function build(): Repository<CadenceTask> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<CadenceTask>({ provider: "in-memory", entityName: "CadenceTask" });
    case "supabase":
      return createRepository<CadenceTask>({
        provider: "supabase",
        entityName: "CadenceTask",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_CADENCE_TASKS_TABLE ?? "cadence_tasks",
        },
      });
    case "firestore":
      return createRepository<CadenceTask>({
        provider: "firestore",
        entityName: "CadenceTask",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_CADENCE_TASKS_COLLECTION ?? "cadence_tasks",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<CadenceTask>({
        provider: "upstash-redis",
        entityName: "CadenceTask",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_CADENCE_TASKS_PREFIX ?? "cadence_tasks",
        },
      });
    case "neon":
      return createRepository<CadenceTask>({
        provider: "neon",
        entityName: "CadenceTask",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_CADENCE_TASKS_TABLE ?? "cadence_tasks",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const cadenceTaskRepository: Repository<CadenceTask> = build();
