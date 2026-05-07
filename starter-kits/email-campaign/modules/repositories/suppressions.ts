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
 * A suppressed email address — blocked from receiving any campaign.
 */
export interface Suppression extends Entity {
  email: string;
  reason: string;
  addedAt: string;
  createdAt: string;
}

function build(): Repository<Suppression> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Suppression>({ provider: "in-memory", entityName: "Suppression" });
    case "supabase":
      return createRepository<Suppression>({
        provider: "supabase",
        entityName: "Suppression",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_SUPPRESSIONS_TABLE ?? "suppressions",
        },
      });
    case "firestore":
      return createRepository<Suppression>({
        provider: "firestore",
        entityName: "Suppression",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_SUPPRESSIONS_COLLECTION ?? "suppressions",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Suppression>({
        provider: "upstash-redis",
        entityName: "Suppression",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_SUPPRESSIONS_PREFIX ?? "suppressions",
        },
      });
    case "neon":
      return createRepository<Suppression>({
        provider: "neon",
        entityName: "Suppression",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_SUPPRESSIONS_TABLE ?? "suppressions",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const suppressionRepository: Repository<Suppression> = build();
