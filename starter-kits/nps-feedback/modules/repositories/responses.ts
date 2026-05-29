import { environment } from "@zuplo/runtime";
import {
  createRepository,
  type DbProvider,
  type Entity,
  type Repository,
} from "@zuplo/starter-kit-shared/adapters";

function requireEnv(name: string): string {
  const value = (environment as Record<string, string | undefined>)[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

/**
 * A single NPS / CSAT / CES response. The `category` column is denormalized
 * from `score` so list endpoints can filter without rescanning.
 */
export interface Response_ extends Entity {
  surveyId: string;
  customerEmail: string;
  score: number;
  comment: string;
  category: "promoter" | "passive" | "detractor";
  respondedAt: string;
  source: string;
  segment: string;
  followedUp: boolean;
}

function build(): Repository<Response_> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Response_>({
        provider: "in-memory",
        entityName: "Response",
      });
    case "supabase":
      return createRepository<Response_>({
        provider: "supabase",
        entityName: "Response",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_RESPONSES_TABLE ?? "responses",
        },
      });
    case "firestore":
      return createRepository<Response_>({
        provider: "firestore",
        entityName: "Response",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_RESPONSES_COLLECTION ?? "responses",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Response_>({
        provider: "upstash-redis",
        entityName: "Response",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_RESPONSES_PREFIX ?? "responses",
        },
      });
    case "neon":
      return createRepository<Response_>({
        provider: "neon",
        entityName: "Response",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_RESPONSES_TABLE ?? "responses",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const responseRepository: Repository<Response_> = build();
