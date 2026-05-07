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
 * A spam rule — pattern + action ('block' | 'flag').
 */
export interface SpamRule extends Entity {
  name: string;
  pattern: string;
  action: "block" | "flag";
  active: boolean;
  createdAt: string;
}

function build(): Repository<SpamRule> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<SpamRule>({ provider: "in-memory", entityName: "SpamRule" });
    case "supabase":
      return createRepository<SpamRule>({
        provider: "supabase",
        entityName: "SpamRule",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_SPAM_RULES_TABLE ?? "spam_rules",
        },
      });
    case "firestore":
      return createRepository<SpamRule>({
        provider: "firestore",
        entityName: "SpamRule",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_SPAM_RULES_COLLECTION ?? "spam_rules",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<SpamRule>({
        provider: "upstash-redis",
        entityName: "SpamRule",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_SPAM_RULES_PREFIX ?? "spam_rules",
        },
      });
    case "neon":
      return createRepository<SpamRule>({
        provider: "neon",
        entityName: "SpamRule",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_SPAM_RULES_TABLE ?? "spam_rules",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const spamRuleRepository: Repository<SpamRule> = build();
