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
 * The Item entity. Replace this with your kit's domain entity.
 * Whatever fields you add, keep `id`, `tenantId` — those are required by
 * Repository<T>.
 */
export interface Item extends Entity {
  name: string;
  status: "open" | "in_progress" | "done" | "archived";
  createdAt: string;
}

/**
 * Resolve the configured Repository<Item> from environment variables.
 * Module-level — created once per worker, reused across requests.
 *
 * The kit ships supporting four adapters (in-memory, supabase, firestore,
 * upstash-redis). To enable an adapter, fill in its credentials in `.env`
 * and set `DB_PROVIDER` to the matching value.
 */
function build(): Repository<Item> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Item>({
        provider: "in-memory",
        entityName: "Item",
      });
    case "supabase":
      return createRepository<Item>({
        provider: "supabase",
        entityName: "Item",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_TABLE ?? "items",
        },
      });
    case "firestore":
      return createRepository<Item>({
        provider: "firestore",
        entityName: "Item",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_COLLECTION ?? "items",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Item>({
        provider: "upstash-redis",
        entityName: "Item",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_KEY_PREFIX ?? "items",
        },
      });
    case "neon":
      return createRepository<Item>({
        provider: "neon",
        entityName: "Item",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_TABLE ?? "items",
        },
      });
    case "clickhouse":
      return createRepository<Item>({
        provider: "clickhouse",
        entityName: "Item",
        clickhouse: {
          url: requireEnv("CLICKHOUSE_URL"),
          username: requireEnv("CLICKHOUSE_USERNAME"),
          password: requireEnv("CLICKHOUSE_PASSWORD"),
          database: requireEnv("CLICKHOUSE_DATABASE"),
          table: environment.CLICKHOUSE_TABLE ?? "items",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const itemRepository: Repository<Item> = build();
