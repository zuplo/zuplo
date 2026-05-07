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
 * A pricing rule. Conditions describe when the rule applies (segment,
 * minimum quantity, etc.) — the orchestrator evaluates them when building
 * a quote. Rules above a threshold can be flagged for approval.
 */
export interface PricingRule extends Entity {
  name: string;
  productId: string;
  conditions: Record<string, unknown>;
  discountPercent: number;
  requiresApproval: boolean;
}

function build(): Repository<PricingRule> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<PricingRule>({ provider: "in-memory", entityName: "PricingRule" });
    case "supabase":
      return createRepository<PricingRule>({
        provider: "supabase",
        entityName: "PricingRule",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_PRICING_RULES_TABLE ?? "pricing_rules",
        },
      });
    case "firestore":
      return createRepository<PricingRule>({
        provider: "firestore",
        entityName: "PricingRule",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_PRICING_RULES_COLLECTION ?? "pricing_rules",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<PricingRule>({
        provider: "upstash-redis",
        entityName: "PricingRule",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_PRICING_RULES_PREFIX ?? "pricing_rules",
        },
      });
    case "neon":
      return createRepository<PricingRule>({
        provider: "neon",
        entityName: "PricingRule",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_PRICING_RULES_TABLE ?? "pricing_rules",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const pricingRuleRepository: Repository<PricingRule> = build();
