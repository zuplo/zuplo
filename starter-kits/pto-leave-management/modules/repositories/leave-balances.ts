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
 * The LeaveBalance entity. Tracks how many days of each leave type an
 * employee has remaining. In production this is computed from accruals;
 * this kit treats it as a stored snapshot.
 */
export interface LeaveBalance extends Entity {
  employeeId: string;
  type: "vacation" | "sick" | "personal" | "unpaid";
  balanceDays: number;
  accruedYtd: number;
  updatedAt: string;
}

function build(): Repository<LeaveBalance> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<LeaveBalance>({
        provider: "in-memory",
        entityName: "LeaveBalance",
      });
    case "supabase":
      return createRepository<LeaveBalance>({
        provider: "supabase",
        entityName: "LeaveBalance",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_BALANCES_TABLE ?? "leave_balances",
        },
      });
    case "firestore":
      return createRepository<LeaveBalance>({
        provider: "firestore",
        entityName: "LeaveBalance",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_BALANCES_COLLECTION ?? "leave_balances",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<LeaveBalance>({
        provider: "upstash-redis",
        entityName: "LeaveBalance",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_BALANCES_KEY_PREFIX ?? "leave_balances",
        },
      });
    case "neon":
      return createRepository<LeaveBalance>({
        provider: "neon",
        entityName: "LeaveBalance",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_BALANCES_TABLE ?? "leave_balances",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const leaveBalanceRepository: Repository<LeaveBalance> = build();
