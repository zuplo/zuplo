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
 * A webhook target — every submission matching `formId` is POSTed here.
 */
export interface Webhook extends Entity {
  formId: string;
  url: string;
  secret: string;
  active: boolean;
  lastDeliveredAt: string | null;
  createdAt: string;
}

function build(): Repository<Webhook> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Webhook>({ provider: "in-memory", entityName: "Webhook" });
    case "supabase":
      return createRepository<Webhook>({
        provider: "supabase",
        entityName: "Webhook",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_WEBHOOKS_TABLE ?? "webhooks",
        },
      });
    case "firestore":
      return createRepository<Webhook>({
        provider: "firestore",
        entityName: "Webhook",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_WEBHOOKS_COLLECTION ?? "webhooks",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Webhook>({
        provider: "upstash-redis",
        entityName: "Webhook",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_WEBHOOKS_PREFIX ?? "webhooks",
        },
      });
    case "neon":
      return createRepository<Webhook>({
        provider: "neon",
        entityName: "Webhook",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_WEBHOOKS_TABLE ?? "webhooks",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const webhookRepository: Repository<Webhook> = build();
