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
 * The Page entity. The primary content unit of the wiki — every doc, runbook,
 * and meeting note is a Page. Pages live inside a Space (slug-keyed) and may
 * have a parent page for hierarchical nav.
 */
export interface Page extends Entity {
  spaceSlug: string;
  slug: string;
  title: string;
  body: string;
  parentPageId: string | null;
  status: "draft" | "published" | "archived";
  authorEmail: string;
  lastEditedBy: string;
  lastEditedAt: string;
  viewCount: number;
}

function build(): Repository<Page> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Page>({
        provider: "in-memory",
        entityName: "Page",
      });
    case "supabase":
      return createRepository<Page>({
        provider: "supabase",
        entityName: "Page",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_PAGES_TABLE ?? "pages",
        },
      });
    case "firestore":
      return createRepository<Page>({
        provider: "firestore",
        entityName: "Page",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_PAGES_COLLECTION ?? "pages",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Page>({
        provider: "upstash-redis",
        entityName: "Page",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_PAGES_KEY_PREFIX ?? "pages",
        },
      });
    case "neon":
      return createRepository<Page>({
        provider: "neon",
        entityName: "Page",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_PAGES_TABLE ?? "pages",
        },
      });
    case "clickhouse":
      return createRepository<Page>({
        provider: "clickhouse",
        entityName: "Page",
        clickhouse: {
          url: requireEnv("CLICKHOUSE_URL"),
          username: requireEnv("CLICKHOUSE_USERNAME"),
          password: requireEnv("CLICKHOUSE_PASSWORD"),
          database: requireEnv("CLICKHOUSE_DATABASE"),
          table: environment.CLICKHOUSE_PAGES_TABLE ?? "pages",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const pageRepository: Repository<Page> = build();
