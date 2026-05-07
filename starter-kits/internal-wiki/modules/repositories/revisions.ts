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
 * The Revision entity. A historical snapshot of a page's body. Created on
 * every update so callers can audit who changed what when.
 */
export interface Revision extends Entity {
  pageId: string;
  body: string;
  savedBy: string;
  savedAt: string;
}

function build(): Repository<Revision> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Revision>({
        provider: "in-memory",
        entityName: "Revision",
      });
    case "supabase":
      return createRepository<Revision>({
        provider: "supabase",
        entityName: "Revision",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_REVISIONS_TABLE ?? "revisions",
        },
      });
    case "firestore":
      return createRepository<Revision>({
        provider: "firestore",
        entityName: "Revision",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_REVISIONS_COLLECTION ?? "revisions",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Revision>({
        provider: "upstash-redis",
        entityName: "Revision",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_REVISIONS_KEY_PREFIX ?? "revisions",
        },
      });
    case "neon":
      return createRepository<Revision>({
        provider: "neon",
        entityName: "Revision",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_REVISIONS_TABLE ?? "revisions",
        },
      });
    case "clickhouse":
      return createRepository<Revision>({
        provider: "clickhouse",
        entityName: "Revision",
        clickhouse: {
          url: requireEnv("CLICKHOUSE_URL"),
          username: requireEnv("CLICKHOUSE_USERNAME"),
          password: requireEnv("CLICKHOUSE_PASSWORD"),
          database: requireEnv("CLICKHOUSE_DATABASE"),
          table: environment.CLICKHOUSE_REVISIONS_TABLE ?? "revisions",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const revisionRepository: Repository<Revision> = build();
