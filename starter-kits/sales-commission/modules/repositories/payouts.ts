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
 * A Payout — one rep's commission earnings for a comp period. Status
 * tracks the calculate → approve → pay → resolve-disputes lifecycle.
 */
export interface Payout extends Entity {
  repEmail: string;
  period: string;
  commissionCents: number;
  baseAmountCents: number;
  accelerator: number;
  attainmentPercent: number;
  status: "draft" | "approved" | "paid" | "disputed";
  paidAt: string | null;
}

function build(): Repository<Payout> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Payout>({ provider: "in-memory", entityName: "Payout" });
    case "supabase":
      return createRepository<Payout>({
        provider: "supabase",
        entityName: "Payout",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_PAYOUTS_TABLE ?? "payouts",
        },
      });
    case "firestore":
      return createRepository<Payout>({
        provider: "firestore",
        entityName: "Payout",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_PAYOUTS_COLLECTION ?? "payouts",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Payout>({
        provider: "upstash-redis",
        entityName: "Payout",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_PAYOUTS_PREFIX ?? "payouts",
        },
      });
    case "neon":
      return createRepository<Payout>({
        provider: "neon",
        entityName: "Payout",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_PAYOUTS_TABLE ?? "payouts",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const payoutRepository: Repository<Payout> = build();
