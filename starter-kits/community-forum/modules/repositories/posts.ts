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
 * A Post — a single reply or comment within a Topic. Posts can be
 * threaded via parentPostId. Soft-deleted posts keep deletedAt set
 * so moderation history is preserved.
 */
export interface Post extends Entity {
  topicId: string;
  body: string;
  authorEmail: string;
  parentPostId: string | null;
  postedAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  likeCount: number;
}

function build(): Repository<Post> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Post>({ provider: "in-memory", entityName: "Post" });
    case "supabase":
      return createRepository<Post>({
        provider: "supabase",
        entityName: "Post",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_POSTS_TABLE ?? "posts",
        },
      });
    case "firestore":
      return createRepository<Post>({
        provider: "firestore",
        entityName: "Post",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_POSTS_COLLECTION ?? "posts",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Post>({
        provider: "upstash-redis",
        entityName: "Post",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_POSTS_PREFIX ?? "posts",
        },
      });
    case "neon":
      return createRepository<Post>({
        provider: "neon",
        entityName: "Post",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_POSTS_TABLE ?? "posts",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const postRepository: Repository<Post> = build();
