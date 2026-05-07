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
 * The Photo entity. A photo (URL + metadata) attached to a job.
 */
export interface Photo extends Entity {
  jobId: string;
  url: string;
  caption: string | null;
  takenAt: string;
  takenBy: string;
}

function build(): Repository<Photo> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Photo>({
        provider: "in-memory",
        entityName: "Photo",
      });
    case "supabase":
      return createRepository<Photo>({
        provider: "supabase",
        entityName: "Photo",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_PHOTOS_TABLE ?? "photos",
        },
      });
    case "firestore":
      return createRepository<Photo>({
        provider: "firestore",
        entityName: "Photo",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_PHOTOS_COLLECTION ?? "photos",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Photo>({
        provider: "upstash-redis",
        entityName: "Photo",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_PHOTOS_KEY_PREFIX ?? "photos",
        },
      });
    case "neon":
      return createRepository<Photo>({
        provider: "neon",
        entityName: "Photo",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_PHOTOS_TABLE ?? "photos",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const photoRepository: Repository<Photo> = build();
