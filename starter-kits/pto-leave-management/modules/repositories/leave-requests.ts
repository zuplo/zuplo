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
 * The LeaveRequest entity. Represents a single PTO/leave request submitted
 * by an employee. Status moves through pending -> approved/denied/cancelled.
 */
export interface LeaveRequest extends Entity {
  employeeId: string;
  startDate: string;
  endDate: string;
  type: "vacation" | "sick" | "personal" | "unpaid";
  status: "pending" | "approved" | "denied" | "cancelled";
  reason: string;
  days: number;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
}

function build(): Repository<LeaveRequest> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<LeaveRequest>({
        provider: "in-memory",
        entityName: "LeaveRequest",
      });
    case "supabase":
      return createRepository<LeaveRequest>({
        provider: "supabase",
        entityName: "LeaveRequest",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_TABLE ?? "leave_requests",
        },
      });
    case "firestore":
      return createRepository<LeaveRequest>({
        provider: "firestore",
        entityName: "LeaveRequest",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_COLLECTION ?? "leave_requests",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<LeaveRequest>({
        provider: "upstash-redis",
        entityName: "LeaveRequest",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_KEY_PREFIX ?? "leave_requests",
        },
      });
    case "neon":
      return createRepository<LeaveRequest>({
        provider: "neon",
        entityName: "LeaveRequest",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_TABLE ?? "leave_requests",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const leaveRequestRepository: Repository<LeaveRequest> = build();
