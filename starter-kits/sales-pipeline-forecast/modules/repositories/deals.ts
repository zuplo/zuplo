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

export type DealStage =
  | "prospect"
  | "qualified"
  | "proposal"
  | "negotiation"
  | "closed_won"
  | "closed_lost";

export type ForecastCategory = "commit" | "upside" | "pipeline" | "omit";

/**
 * A deal — a lighter shape than the headless-crm kit, focused on what's
 * needed for forecasting.
 */
export interface Deal extends Entity {
  name: string;
  ownerEmail: string;
  stage: DealStage;
  amountCents: number;
  expectedCloseDate: string;
  forecastCategory: ForecastCategory;
  stageEnteredAt: string;
  createdAt: string;
}

function build(): Repository<Deal> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Deal>({ provider: "in-memory", entityName: "Deal" });
    case "supabase":
      return createRepository<Deal>({
        provider: "supabase",
        entityName: "Deal",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_DEALS_TABLE ?? "deals",
        },
      });
    case "firestore":
      return createRepository<Deal>({
        provider: "firestore",
        entityName: "Deal",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_DEALS_COLLECTION ?? "deals",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Deal>({
        provider: "upstash-redis",
        entityName: "Deal",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_DEALS_PREFIX ?? "deals",
        },
      });
    case "neon":
      return createRepository<Deal>({
        provider: "neon",
        entityName: "Deal",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_DEALS_TABLE ?? "deals",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const dealRepository: Repository<Deal> = build();
