import { environment } from "@zuplo/runtime";
import {
  createRepository,
  type DbProvider,
  type Entity,
  type Repository,
} from "@zuplo/starter-kit-shared/adapters";

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
 * The Timesheet entity. Aggregates a week of TimeEntry rows for an employee
 * into a single submittable record.
 */
export interface Timesheet extends Entity {
  employeeId: string;
  weekStartDate: string;
  status: "draft" | "submitted" | "approved" | "rejected";
  totalMinutes: number;
  submittedAt: string | null;
  approvedAt: string | null;
  createdAt: string;
}

function build(): Repository<Timesheet> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Timesheet>({
        provider: "in-memory",
        entityName: "Timesheet",
      });
    case "supabase":
      return createRepository<Timesheet>({
        provider: "supabase",
        entityName: "Timesheet",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_TIMESHEETS_TABLE ?? "timesheets",
        },
      });
    case "firestore":
      return createRepository<Timesheet>({
        provider: "firestore",
        entityName: "Timesheet",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_TIMESHEETS_COLLECTION ?? "timesheets",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Timesheet>({
        provider: "upstash-redis",
        entityName: "Timesheet",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_TIMESHEETS_KEY_PREFIX ?? "timesheets",
        },
      });
    case "neon":
      return createRepository<Timesheet>({
        provider: "neon",
        entityName: "Timesheet",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_TIMESHEETS_TABLE ?? "timesheets",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const timesheetRepository: Repository<Timesheet> = build();
