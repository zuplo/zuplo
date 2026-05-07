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
 * A contact who can be sent campaigns.
 */
export interface Subscriber extends Entity {
  email: string;
  firstName: string;
  lastName: string;
  status: "subscribed" | "unsubscribed" | "bounced";
  attributes: Record<string, unknown>;
  subscribedAt: string | null;
  unsubscribedAt: string | null;
  createdAt: string;
}

function build(): Repository<Subscriber> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Subscriber>({ provider: "in-memory", entityName: "Subscriber" });
    case "supabase":
      return createRepository<Subscriber>({
        provider: "supabase",
        entityName: "Subscriber",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_SUBSCRIBERS_TABLE ?? "subscribers",
        },
      });
    case "firestore":
      return createRepository<Subscriber>({
        provider: "firestore",
        entityName: "Subscriber",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_SUBSCRIBERS_COLLECTION ?? "subscribers",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Subscriber>({
        provider: "upstash-redis",
        entityName: "Subscriber",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_SUBSCRIBERS_PREFIX ?? "subscribers",
        },
      });
    case "neon":
      return createRepository<Subscriber>({
        provider: "neon",
        entityName: "Subscriber",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_SUBSCRIBERS_TABLE ?? "subscribers",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const subscriberRepository: Repository<Subscriber> = build();
