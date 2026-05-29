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
 * A Category — a forum section that groups Topics. Categories support
 * a parent slug for nested hierarchies and a displayOrder for sorting.
 */
export interface Category extends Entity {
  slug: string;
  name: string;
  description: string;
  displayOrder: number;
  parentSlug: string | null;
}

function build(): Repository<Category> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Category>({ provider: "in-memory", entityName: "Category" });
    case "supabase":
      return createRepository<Category>({
        provider: "supabase",
        entityName: "Category",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_CATEGORIES_TABLE ?? "categories",
        },
      });
    case "firestore":
      return createRepository<Category>({
        provider: "firestore",
        entityName: "Category",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_CATEGORIES_COLLECTION ?? "categories",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Category>({
        provider: "upstash-redis",
        entityName: "Category",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_CATEGORIES_PREFIX ?? "categories",
        },
      });
    case "neon":
      return createRepository<Category>({
        provider: "neon",
        entityName: "Category",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_CATEGORIES_TABLE ?? "categories",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const categoryRepository: Repository<Category> = build();
