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
 * The Label entity. A coloured tag that can be applied to tasks via the
 * `labels` array on Task.
 */
export interface Label extends Entity {
  slug: string;
  name: string;
  color: string;
  createdAt: string;
}

function build(): Repository<Label> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Label>({
        provider: "in-memory",
        entityName: "Label",
      });
    case "supabase":
      return createRepository<Label>({
        provider: "supabase",
        entityName: "Label",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_LABELS_TABLE ?? "labels",
        },
      });
    case "firestore":
      return createRepository<Label>({
        provider: "firestore",
        entityName: "Label",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_LABELS_COLLECTION ?? "labels",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Label>({
        provider: "upstash-redis",
        entityName: "Label",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_LABELS_KEY_PREFIX ?? "labels",
        },
      });
    case "neon":
      return createRepository<Label>({
        provider: "neon",
        entityName: "Label",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_LABELS_TABLE ?? "labels",
        },
      });
    case "clickhouse":
      return createRepository<Label>({
        provider: "clickhouse",
        entityName: "Label",
        clickhouse: {
          url: requireEnv("CLICKHOUSE_URL"),
          username: requireEnv("CLICKHOUSE_USERNAME"),
          password: requireEnv("CLICKHOUSE_PASSWORD"),
          database: requireEnv("CLICKHOUSE_DATABASE"),
          table: environment.CLICKHOUSE_LABELS_TABLE ?? "labels",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const labelRepository: Repository<Label> = build();
