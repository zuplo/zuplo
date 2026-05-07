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
 * A survey definition. One survey can be sent many times; the responses
 * carry the `surveyId` back so multi-survey programs can roll up across
 * cadences.
 */
export interface Survey extends Entity {
  name: string;
  kind: "nps" | "csat" | "ces";
  question: string;
  sendCadence: "post_action" | "weekly" | "monthly" | "manual";
  status: "active" | "paused";
}

function build(): Repository<Survey> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Survey>({
        provider: "in-memory",
        entityName: "Survey",
      });
    case "supabase":
      return createRepository<Survey>({
        provider: "supabase",
        entityName: "Survey",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_SURVEYS_TABLE ?? "surveys",
        },
      });
    case "firestore":
      return createRepository<Survey>({
        provider: "firestore",
        entityName: "Survey",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_SURVEYS_COLLECTION ?? "surveys",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Survey>({
        provider: "upstash-redis",
        entityName: "Survey",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_SURVEYS_PREFIX ?? "surveys",
        },
      });
    case "neon":
      return createRepository<Survey>({
        provider: "neon",
        entityName: "Survey",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_SURVEYS_TABLE ?? "surveys",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const surveyRepository: Repository<Survey> = build();
