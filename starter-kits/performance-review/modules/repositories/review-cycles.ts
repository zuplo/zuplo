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
 * The ReviewCycle entity. Bounds a window of reviews (annual, mid-year,
 * quarterly).
 */
export interface ReviewCycle extends Entity {
  name: string;
  startDate: string;
  endDate: string;
  kind: "annual" | "midyear" | "quarterly";
  status: "open" | "in_review" | "closed";
  createdAt: string;
}

function build(): Repository<ReviewCycle> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<ReviewCycle>({ provider: "in-memory", entityName: "ReviewCycle" });
    case "supabase":
      return createRepository<ReviewCycle>({
        provider: "supabase",
        entityName: "ReviewCycle",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_CYCLES_TABLE ?? "review_cycles",
        },
      });
    case "firestore":
      return createRepository<ReviewCycle>({
        provider: "firestore",
        entityName: "ReviewCycle",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_CYCLES_COLLECTION ?? "review_cycles",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<ReviewCycle>({
        provider: "upstash-redis",
        entityName: "ReviewCycle",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_CYCLES_KEY_PREFIX ?? "review_cycles",
        },
      });
    case "neon":
      return createRepository<ReviewCycle>({
        provider: "neon",
        entityName: "ReviewCycle",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_CYCLES_TABLE ?? "review_cycles",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const reviewCycleRepository: Repository<ReviewCycle> = build();
