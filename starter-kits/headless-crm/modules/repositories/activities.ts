import { environment } from "@zuplo/runtime";
import {
  createRepository,
  type DbProvider,
  type Entity,
  type Repository,
} from "@zuplo/starter-kit-shared/adapters";

function requireEnv(name: string): string {
  const value = (environment as Record<string, string | undefined>)[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

/** A logged interaction (email/call/meeting/note). */
export interface Activity extends Entity {
  kind: "email" | "call" | "meeting" | "note";
  subject: string;
  body: string;
  dealId: string | null;
  contactId: string | null;
  accountId: string | null;
  occurredAt: string;
  ownerEmail: string;
}

function build(): Repository<Activity> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Activity>({ provider: "in-memory", entityName: "Activity" });
    case "supabase":
      return createRepository<Activity>({
        provider: "supabase",
        entityName: "Activity",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_ACTIVITIES_TABLE ?? "activities",
        },
      });
    case "firestore":
      return createRepository<Activity>({
        provider: "firestore",
        entityName: "Activity",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_ACTIVITIES_COLLECTION ?? "activities",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Activity>({
        provider: "upstash-redis",
        entityName: "Activity",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_ACTIVITIES_PREFIX ?? "activities",
        },
      });
    case "neon":
      return createRepository<Activity>({
        provider: "neon",
        entityName: "Activity",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_ACTIVITIES_TABLE ?? "activities",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const activityRepository: Repository<Activity> = build();
