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
 * The Subscriber entity. A customer who has opted in to status page
 * notifications. Subscribers can target specific components and a minimum
 * impact level so they only hear about events that matter to them.
 */
export interface Subscriber extends Entity {
  email: string;
  /** Optional E.164 phone for SMS via Twilio. */
  phone: string | null;
  /** Optional incoming-webhook URL for Slack delivery into the subscriber's
   *  workspace. They own the endpoint; we just POST. */
  slackWebhookUrl: string | null;
  /** Which channels this subscriber wants. Empty defaults to ["email"]. */
  channels: Array<"email" | "sms" | "slack">;
  components: string[];
  notifyOnImpact: "none" | "minor" | "major" | "critical";
  createdAt: string;
}

function build(): Repository<Subscriber> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Subscriber>({
        provider: "in-memory",
        entityName: "Subscriber",
      });
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
          collection:
            environment.FIRESTORE_SUBSCRIBERS_COLLECTION ?? "subscribers",
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
          keyPrefix:
            environment.UPSTASH_SUBSCRIBERS_KEY_PREFIX ?? "subscribers",
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
    case "clickhouse":
      return createRepository<Subscriber>({
        provider: "clickhouse",
        entityName: "Subscriber",
        clickhouse: {
          url: requireEnv("CLICKHOUSE_URL"),
          username: requireEnv("CLICKHOUSE_USERNAME"),
          password: requireEnv("CLICKHOUSE_PASSWORD"),
          database: requireEnv("CLICKHOUSE_DATABASE"),
          table: environment.CLICKHOUSE_SUBSCRIBERS_TABLE ?? "subscribers",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const subscriberRepository: Repository<Subscriber> = build();
