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
 * A single per-subscriber send record. One Send per (campaign, subscriber)
 * pair, used to compute engagement and pace future sends.
 */
export interface Send extends Entity {
  campaignId: string;
  subscriberEmail: string;
  status: "queued" | "sent" | "bounced" | "failed";
  sentAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  createdAt: string;
}

function build(): Repository<Send> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Send>({ provider: "in-memory", entityName: "Send" });
    case "supabase":
      return createRepository<Send>({
        provider: "supabase",
        entityName: "Send",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_SENDS_TABLE ?? "sends",
        },
      });
    case "firestore":
      return createRepository<Send>({
        provider: "firestore",
        entityName: "Send",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_SENDS_COLLECTION ?? "sends",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Send>({
        provider: "upstash-redis",
        entityName: "Send",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_SENDS_PREFIX ?? "sends",
        },
      });
    case "neon":
      return createRepository<Send>({
        provider: "neon",
        entityName: "Send",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_SENDS_TABLE ?? "sends",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const sendRepository: Repository<Send> = build();
