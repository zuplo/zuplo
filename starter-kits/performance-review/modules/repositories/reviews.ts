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
 * The Review entity. A single review (self / peer / manager / upward) tied
 * to a ReviewCycle.
 */
export interface Review extends Entity {
  revieweeEmail: string;
  reviewerEmail: string;
  cycleId: string;
  kind: "self" | "peer" | "manager" | "upward";
  status: "draft" | "submitted";
  ratings: Record<string, number>;
  narrative: string;
  submittedAt: string | null;
  createdAt: string;
}

function build(): Repository<Review> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Review>({ provider: "in-memory", entityName: "Review" });
    case "supabase":
      return createRepository<Review>({
        provider: "supabase",
        entityName: "Review",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_REVIEWS_TABLE ?? "reviews",
        },
      });
    case "firestore":
      return createRepository<Review>({
        provider: "firestore",
        entityName: "Review",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_REVIEWS_COLLECTION ?? "reviews",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Review>({
        provider: "upstash-redis",
        entityName: "Review",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_REVIEWS_KEY_PREFIX ?? "reviews",
        },
      });
    case "neon":
      return createRepository<Review>({
        provider: "neon",
        entityName: "Review",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_REVIEWS_TABLE ?? "reviews",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const reviewRepository: Repository<Review> = build();
