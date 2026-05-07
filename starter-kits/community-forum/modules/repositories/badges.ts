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
 * A Badge — a community recognition that members earn. The criteria
 * field is a free-form description used by the orchestrator that
 * proposes badge awards.
 */
export interface Badge extends Entity {
  slug: string;
  name: string;
  description: string;
  criteria: string;
}

function build(): Repository<Badge> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Badge>({ provider: "in-memory", entityName: "Badge" });
    case "supabase":
      return createRepository<Badge>({
        provider: "supabase",
        entityName: "Badge",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_BADGES_TABLE ?? "badges",
        },
      });
    case "firestore":
      return createRepository<Badge>({
        provider: "firestore",
        entityName: "Badge",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_BADGES_COLLECTION ?? "badges",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Badge>({
        provider: "upstash-redis",
        entityName: "Badge",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_BADGES_PREFIX ?? "badges",
        },
      });
    case "neon":
      return createRepository<Badge>({
        provider: "neon",
        entityName: "Badge",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_BADGES_TABLE ?? "badges",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const badgeRepository: Repository<Badge> = build();
