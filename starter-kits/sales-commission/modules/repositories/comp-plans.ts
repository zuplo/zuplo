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
 * A CompPlan — the rule book for a comp period. Defines the base rate
 * and any accelerators (commission rate jumps once attainment hits a
 * threshold).
 */
export interface AcceleratorTier {
  threshold: number;
  rate: number;
}

export interface CompPlan extends Entity {
  name: string;
  baseRate: number;
  accelerators: AcceleratorTier[];
  period: string;
}

function build(): Repository<CompPlan> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<CompPlan>({ provider: "in-memory", entityName: "CompPlan" });
    case "supabase":
      return createRepository<CompPlan>({
        provider: "supabase",
        entityName: "CompPlan",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_COMP_PLANS_TABLE ?? "comp_plans",
        },
      });
    case "firestore":
      return createRepository<CompPlan>({
        provider: "firestore",
        entityName: "CompPlan",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_COMP_PLANS_COLLECTION ?? "comp_plans",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<CompPlan>({
        provider: "upstash-redis",
        entityName: "CompPlan",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_COMP_PLANS_PREFIX ?? "comp_plans",
        },
      });
    case "neon":
      return createRepository<CompPlan>({
        provider: "neon",
        entityName: "CompPlan",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_COMP_PLANS_TABLE ?? "comp_plans",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const compPlanRepository: Repository<CompPlan> = build();
