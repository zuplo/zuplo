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
 * A specific risk on a renewal — usage drop, late invoice, exec churn, etc.
 * `addressedAt` is set when the AE marks the risk as resolved.
 */
export interface RiskFactor extends Entity {
  renewalId: string;
  factor: string;
  severity: "low" | "med" | "high";
  addedAt: string;
  addressedAt: string | null;
}

function build(): Repository<RiskFactor> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<RiskFactor>({
        provider: "in-memory",
        entityName: "RiskFactor",
      });
    case "supabase":
      return createRepository<RiskFactor>({
        provider: "supabase",
        entityName: "RiskFactor",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_RISK_FACTORS_TABLE ?? "risk_factors",
        },
      });
    case "firestore":
      return createRepository<RiskFactor>({
        provider: "firestore",
        entityName: "RiskFactor",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_RISK_FACTORS_COLLECTION ?? "risk_factors",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<RiskFactor>({
        provider: "upstash-redis",
        entityName: "RiskFactor",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_RISK_FACTORS_PREFIX ?? "risk_factors",
        },
      });
    case "neon":
      return createRepository<RiskFactor>({
        provider: "neon",
        entityName: "RiskFactor",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_RISK_FACTORS_TABLE ?? "risk_factors",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const riskFactorRepository: Repository<RiskFactor> = build();
