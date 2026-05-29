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
 * A Reaction — one member's emoji reaction to a post. Reactions roll
 * up into Member.helpfulCount when kind is "helpful" or "insightful".
 */
export interface Reaction extends Entity {
  postId: string;
  memberEmail: string;
  kind: "like" | "love" | "insightful" | "helpful";
  createdAt: string;
}

function build(): Repository<Reaction> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Reaction>({ provider: "in-memory", entityName: "Reaction" });
    case "supabase":
      return createRepository<Reaction>({
        provider: "supabase",
        entityName: "Reaction",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_REACTIONS_TABLE ?? "reactions",
        },
      });
    case "firestore":
      return createRepository<Reaction>({
        provider: "firestore",
        entityName: "Reaction",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_REACTIONS_COLLECTION ?? "reactions",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Reaction>({
        provider: "upstash-redis",
        entityName: "Reaction",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_REACTIONS_PREFIX ?? "reactions",
        },
      });
    case "neon":
      return createRepository<Reaction>({
        provider: "neon",
        entityName: "Reaction",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_REACTIONS_TABLE ?? "reactions",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const reactionRepository: Repository<Reaction> = build();
