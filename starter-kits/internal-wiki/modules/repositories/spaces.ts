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
 * The Space entity. A namespace for pages — typically one per team or
 * project. Visibility controls whether the whole org can read it or only
 * named permission rows.
 */
export interface Space extends Entity {
  slug: string;
  name: string;
  description: string;
  ownerEmail: string;
  visibility: "public" | "team" | "private";
  createdAt: string;
}

function build(): Repository<Space> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Space>({
        provider: "in-memory",
        entityName: "Space",
      });
    case "supabase":
      return createRepository<Space>({
        provider: "supabase",
        entityName: "Space",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_SPACES_TABLE ?? "spaces",
        },
      });
    case "firestore":
      return createRepository<Space>({
        provider: "firestore",
        entityName: "Space",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_SPACES_COLLECTION ?? "spaces",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Space>({
        provider: "upstash-redis",
        entityName: "Space",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_SPACES_KEY_PREFIX ?? "spaces",
        },
      });
    case "neon":
      return createRepository<Space>({
        provider: "neon",
        entityName: "Space",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_SPACES_TABLE ?? "spaces",
        },
      });
    case "clickhouse":
      return createRepository<Space>({
        provider: "clickhouse",
        entityName: "Space",
        clickhouse: {
          url: requireEnv("CLICKHOUSE_URL"),
          username: requireEnv("CLICKHOUSE_USERNAME"),
          password: requireEnv("CLICKHOUSE_PASSWORD"),
          database: requireEnv("CLICKHOUSE_DATABASE"),
          table: environment.CLICKHOUSE_SPACES_TABLE ?? "spaces",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const spaceRepository: Repository<Space> = build();
