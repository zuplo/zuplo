import { environment } from "@zuplo/runtime";
import {
  createRepository,
  type DbProvider,
  type Entity,
  type Repository,
} from "../_shared/adapters/index.ts";

function requireEnv(name: string): string {
  const value = (environment as Record<string, string | undefined>)[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

/**
 * A logged follow-up against a single response — the bookkeeping that
 * "we did reach out" so the detractor-tracker doesn't surface this row
 * again.
 */
export interface FollowUp extends Entity {
  responseId: string;
  byEmail: string;
  kind: "email" | "call";
  body: string;
  sentAt: string;
}

function build(): Repository<FollowUp> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<FollowUp>({
        provider: "in-memory",
        entityName: "FollowUp",
      });
    case "supabase":
      return createRepository<FollowUp>({
        provider: "supabase",
        entityName: "FollowUp",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_FOLLOW_UPS_TABLE ?? "follow_ups",
        },
      });
    case "firestore":
      return createRepository<FollowUp>({
        provider: "firestore",
        entityName: "FollowUp",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_FOLLOW_UPS_COLLECTION ?? "follow_ups",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<FollowUp>({
        provider: "upstash-redis",
        entityName: "FollowUp",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_FOLLOW_UPS_PREFIX ?? "follow_ups",
        },
      });
    case "neon":
      return createRepository<FollowUp>({
        provider: "neon",
        entityName: "FollowUp",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_FOLLOW_UPS_TABLE ?? "follow_ups",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const followUpRepository: Repository<FollowUp> = build();
