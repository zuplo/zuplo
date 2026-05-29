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
 * The Comment entity. A discussion thread entry on a page. resolvedAt
 * lets a thread be marked done without losing the audit trail.
 */
export interface Comment extends Entity {
  pageId: string;
  body: string;
  authorEmail: string;
  postedAt: string;
  resolvedAt: string | null;
}

function build(): Repository<Comment> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Comment>({
        provider: "in-memory",
        entityName: "Comment",
      });
    case "supabase":
      return createRepository<Comment>({
        provider: "supabase",
        entityName: "Comment",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_COMMENTS_TABLE ?? "comments",
        },
      });
    case "firestore":
      return createRepository<Comment>({
        provider: "firestore",
        entityName: "Comment",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_COMMENTS_COLLECTION ?? "comments",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Comment>({
        provider: "upstash-redis",
        entityName: "Comment",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_COMMENTS_KEY_PREFIX ?? "comments",
        },
      });
    case "neon":
      return createRepository<Comment>({
        provider: "neon",
        entityName: "Comment",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_COMMENTS_TABLE ?? "comments",
        },
      });
    case "clickhouse":
      return createRepository<Comment>({
        provider: "clickhouse",
        entityName: "Comment",
        clickhouse: {
          url: requireEnv("CLICKHOUSE_URL"),
          username: requireEnv("CLICKHOUSE_USERNAME"),
          password: requireEnv("CLICKHOUSE_PASSWORD"),
          database: requireEnv("CLICKHOUSE_DATABASE"),
          table: environment.CLICKHOUSE_COMMENTS_TABLE ?? "comments",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const commentRepository: Repository<Comment> = build();
