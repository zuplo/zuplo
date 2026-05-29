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

/**
 * A renewal opportunity — the unit of forecasting. One per contract.
 */
export interface RenewalOpportunity extends Entity {
  contractId: string;
  accountId: string;
  ownerEmail: string;
  renewsOn: string;
  currentArrCents: number;
  proposedArrCents: number;
  status: "upcoming" | "in_negotiation" | "won" | "lost" | "churned";
  riskTier: "low" | "med" | "high";
  forecastCategory: "commit" | "upside" | "pipeline";
}

function build(): Repository<RenewalOpportunity> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<RenewalOpportunity>({
        provider: "in-memory",
        entityName: "RenewalOpportunity",
      });
    case "supabase":
      return createRepository<RenewalOpportunity>({
        provider: "supabase",
        entityName: "RenewalOpportunity",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_RENEWALS_TABLE ?? "renewals",
        },
      });
    case "firestore":
      return createRepository<RenewalOpportunity>({
        provider: "firestore",
        entityName: "RenewalOpportunity",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_RENEWALS_COLLECTION ?? "renewals",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<RenewalOpportunity>({
        provider: "upstash-redis",
        entityName: "RenewalOpportunity",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_RENEWALS_PREFIX ?? "renewals",
        },
      });
    case "neon":
      return createRepository<RenewalOpportunity>({
        provider: "neon",
        entityName: "RenewalOpportunity",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_RENEWALS_TABLE ?? "renewals",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const renewalRepository: Repository<RenewalOpportunity> = build();
