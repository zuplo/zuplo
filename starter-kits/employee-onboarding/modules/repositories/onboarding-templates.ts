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
 * A single task definition inside an OnboardingTemplate.
 * Day-offset is relative to the hire's startDate (negative for pre-start).
 */
export interface TaskTemplate {
  title: string;
  description: string;
  ownerEmail: string;
  category: "it" | "hr" | "manager" | "buddy";
  daysFromStart: number;
  dependsOnTitles: string[];
}

/**
 * The OnboardingTemplate entity. A reusable checklist for a role.
 */
export interface OnboardingTemplate extends Entity {
  name: string;
  role: string;
  tasks: TaskTemplate[];
  createdAt: string;
}

function build(): Repository<OnboardingTemplate> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<OnboardingTemplate>({ provider: "in-memory", entityName: "OnboardingTemplate" });
    case "supabase":
      return createRepository<OnboardingTemplate>({
        provider: "supabase",
        entityName: "OnboardingTemplate",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_TEMPLATES_TABLE ?? "onboarding_templates",
        },
      });
    case "firestore":
      return createRepository<OnboardingTemplate>({
        provider: "firestore",
        entityName: "OnboardingTemplate",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_TEMPLATES_COLLECTION ?? "onboarding_templates",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<OnboardingTemplate>({
        provider: "upstash-redis",
        entityName: "OnboardingTemplate",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_TEMPLATES_KEY_PREFIX ?? "onboarding_templates",
        },
      });
    case "neon":
      return createRepository<OnboardingTemplate>({
        provider: "neon",
        entityName: "OnboardingTemplate",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_TEMPLATES_TABLE ?? "onboarding_templates",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const onboardingTemplateRepository: Repository<OnboardingTemplate> = build();
