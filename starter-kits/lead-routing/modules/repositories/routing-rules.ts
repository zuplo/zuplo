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
 * A routing rule — evaluated in priority order to assign a Lead. Conditions
 * is a free-form match map (industry, employees, country, source, etc.).
 */
export interface RoutingRule extends Entity {
  name: string;
  priority: number;
  conditions: Record<string, unknown>;
  assignTo: string;
  active: boolean;
}

function build(): Repository<RoutingRule> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<RoutingRule>({ provider: "in-memory", entityName: "RoutingRule" });
    case "supabase":
      return createRepository<RoutingRule>({
        provider: "supabase",
        entityName: "RoutingRule",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_ROUTING_RULES_TABLE ?? "routing_rules",
        },
      });
    case "firestore":
      return createRepository<RoutingRule>({
        provider: "firestore",
        entityName: "RoutingRule",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_ROUTING_RULES_COLLECTION ?? "routing_rules",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<RoutingRule>({
        provider: "upstash-redis",
        entityName: "RoutingRule",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_ROUTING_RULES_PREFIX ?? "routing_rules",
        },
      });
    case "neon":
      return createRepository<RoutingRule>({
        provider: "neon",
        entityName: "RoutingRule",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_ROUTING_RULES_TABLE ?? "routing_rules",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const routingRuleRepository: Repository<RoutingRule> = build();
