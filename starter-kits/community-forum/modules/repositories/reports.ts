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
 * A Report — a moderation flag filed by a member against a post.
 * Tracks lifecycle status (pending/resolved/dismissed) for
 * moderator review.
 */
export interface Report extends Entity {
  postId: string;
  reportedBy: string;
  reason: string;
  status: "pending" | "resolved" | "dismissed";
  resolvedAt: string | null;
}

function build(): Repository<Report> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Report>({ provider: "in-memory", entityName: "Report" });
    case "supabase":
      return createRepository<Report>({
        provider: "supabase",
        entityName: "Report",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_REPORTS_TABLE ?? "reports",
        },
      });
    case "firestore":
      return createRepository<Report>({
        provider: "firestore",
        entityName: "Report",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_REPORTS_COLLECTION ?? "reports",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Report>({
        provider: "upstash-redis",
        entityName: "Report",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_REPORTS_PREFIX ?? "reports",
        },
      });
    case "neon":
      return createRepository<Report>({
        provider: "neon",
        entityName: "Report",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_REPORTS_TABLE ?? "reports",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const reportRepository: Repository<Report> = build();
