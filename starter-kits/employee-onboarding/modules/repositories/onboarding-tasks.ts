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
 * The OnboardingTask entity. A single checklist item attached to a Hire.
 */
export interface OnboardingTask extends Entity {
  hireId: string;
  title: string;
  description: string;
  ownerEmail: string;
  dueDate: string;
  status: "open" | "in_progress" | "done" | "blocked";
  category: "it" | "hr" | "manager" | "buddy";
  dependsOn: string[];
  completedAt: string | null;
  createdAt: string;
}

function build(): Repository<OnboardingTask> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<OnboardingTask>({ provider: "in-memory", entityName: "OnboardingTask" });
    case "supabase":
      return createRepository<OnboardingTask>({
        provider: "supabase",
        entityName: "OnboardingTask",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_TASKS_TABLE ?? "onboarding_tasks",
        },
      });
    case "firestore":
      return createRepository<OnboardingTask>({
        provider: "firestore",
        entityName: "OnboardingTask",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_TASKS_COLLECTION ?? "onboarding_tasks",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<OnboardingTask>({
        provider: "upstash-redis",
        entityName: "OnboardingTask",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_TASKS_KEY_PREFIX ?? "onboarding_tasks",
        },
      });
    case "neon":
      return createRepository<OnboardingTask>({
        provider: "neon",
        entityName: "OnboardingTask",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_TASKS_TABLE ?? "onboarding_tasks",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const onboardingTaskRepository: Repository<OnboardingTask> = build();
