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
 * A Topic — the primary forum entity. Belongs to a category and contains
 * a body plus a stream of replies (Posts). Tracks engagement counters
 * (post/reply/view) and last-reply metadata for sorting.
 */
export interface Topic extends Entity {
  categorySlug: string;
  title: string;
  body: string;
  authorEmail: string;
  status: "open" | "closed" | "pinned" | "archived";
  postCount: number;
  replyCount: number;
  viewCount: number;
  lastReplyAt: string | null;
  createdAt: string;
  lastReplyBy: string | null;
}

function build(): Repository<Topic> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Topic>({ provider: "in-memory", entityName: "Topic" });
    case "supabase":
      return createRepository<Topic>({
        provider: "supabase",
        entityName: "Topic",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_TOPICS_TABLE ?? "topics",
        },
      });
    case "firestore":
      return createRepository<Topic>({
        provider: "firestore",
        entityName: "Topic",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_TOPICS_COLLECTION ?? "topics",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Topic>({
        provider: "upstash-redis",
        entityName: "Topic",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_TOPICS_PREFIX ?? "topics",
        },
      });
    case "neon":
      return createRepository<Topic>({
        provider: "neon",
        entityName: "Topic",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_TOPICS_TABLE ?? "topics",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const topicRepository: Repository<Topic> = build();
