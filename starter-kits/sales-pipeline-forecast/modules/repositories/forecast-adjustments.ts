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

/** A management adjustment (positive or negative) on a Forecast row. */
export interface ForecastAdjustment extends Entity {
  forecastId: string;
  byEmail: string;
  fromAmountCents: number;
  toAmountCents: number;
  reason: string;
  adjustedAt: string;
}

function build(): Repository<ForecastAdjustment> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<ForecastAdjustment>({ provider: "in-memory", entityName: "ForecastAdjustment" });
    case "supabase":
      return createRepository<ForecastAdjustment>({
        provider: "supabase",
        entityName: "ForecastAdjustment",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_FORECAST_ADJUSTMENTS_TABLE ?? "forecast_adjustments",
        },
      });
    case "firestore":
      return createRepository<ForecastAdjustment>({
        provider: "firestore",
        entityName: "ForecastAdjustment",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_FORECAST_ADJUSTMENTS_COLLECTION ?? "forecast_adjustments",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<ForecastAdjustment>({
        provider: "upstash-redis",
        entityName: "ForecastAdjustment",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_FORECAST_ADJUSTMENTS_PREFIX ?? "forecast_adjustments",
        },
      });
    case "neon":
      return createRepository<ForecastAdjustment>({
        provider: "neon",
        entityName: "ForecastAdjustment",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_FORECAST_ADJUSTMENTS_TABLE ?? "forecast_adjustments",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const forecastAdjustmentRepository: Repository<ForecastAdjustment> = build();
