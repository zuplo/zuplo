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
 * The Goal entity. An objective an employee tracks progress against.
 */
export interface Goal extends Entity {
  employeeEmail: string;
  title: string;
  description: string;
  dueDate: string;
  progress: number;
  status: "on_track" | "at_risk" | "completed";
  createdAt: string;
}

function build(): Repository<Goal> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Goal>({ provider: "in-memory", entityName: "Goal" });
    case "supabase":
      return createRepository<Goal>({
        provider: "supabase",
        entityName: "Goal",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_GOALS_TABLE ?? "goals",
        },
      });
    case "firestore":
      return createRepository<Goal>({
        provider: "firestore",
        entityName: "Goal",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_GOALS_COLLECTION ?? "goals",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Goal>({
        provider: "upstash-redis",
        entityName: "Goal",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_GOALS_KEY_PREFIX ?? "goals",
        },
      });
    case "neon":
      return createRepository<Goal>({
        provider: "neon",
        entityName: "Goal",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_GOALS_TABLE ?? "goals",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const goalRepository: Repository<Goal> = build();
