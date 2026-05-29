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
 * The Application entity. A specific candidate applying to a specific job;
 * advances through pipeline stages.
 */
export interface Application extends Entity {
  candidateId: string;
  jobId: string;
  stage: "applied" | "phone_screen" | "onsite" | "offer" | "hired" | "rejected";
  stageEnteredAt: string;
  source: string;
  resumeUrl: string | null;
  score: number | null;
  createdAt: string;
}

function build(): Repository<Application> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Application>({
        provider: "in-memory",
        entityName: "Application",
      });
    case "supabase":
      return createRepository<Application>({
        provider: "supabase",
        entityName: "Application",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_APPLICATIONS_TABLE ?? "applications",
        },
      });
    case "firestore":
      return createRepository<Application>({
        provider: "firestore",
        entityName: "Application",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_APPLICATIONS_COLLECTION ?? "applications",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Application>({
        provider: "upstash-redis",
        entityName: "Application",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_APPLICATIONS_KEY_PREFIX ?? "applications",
        },
      });
    case "neon":
      return createRepository<Application>({
        provider: "neon",
        entityName: "Application",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_APPLICATIONS_TABLE ?? "applications",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const applicationRepository: Repository<Application> = build();
