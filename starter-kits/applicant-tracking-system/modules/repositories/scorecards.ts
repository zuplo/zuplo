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
 * The Scorecard entity. An interviewer's structured feedback after an Interview.
 */
export interface Scorecard extends Entity {
  interviewId: string;
  applicationId: string;
  interviewerEmail: string;
  ratings: Record<string, number>;
  recommendation: "yes" | "strong_yes" | "no" | "strong_no";
  notes: string;
  createdAt: string;
}

function build(): Repository<Scorecard> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Scorecard>({ provider: "in-memory", entityName: "Scorecard" });
    case "supabase":
      return createRepository<Scorecard>({
        provider: "supabase",
        entityName: "Scorecard",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_SCORECARDS_TABLE ?? "scorecards",
        },
      });
    case "firestore":
      return createRepository<Scorecard>({
        provider: "firestore",
        entityName: "Scorecard",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_SCORECARDS_COLLECTION ?? "scorecards",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Scorecard>({
        provider: "upstash-redis",
        entityName: "Scorecard",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_SCORECARDS_KEY_PREFIX ?? "scorecards",
        },
      });
    case "neon":
      return createRepository<Scorecard>({
        provider: "neon",
        entityName: "Scorecard",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_SCORECARDS_TABLE ?? "scorecards",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const scorecardRepository: Repository<Scorecard> = build();
