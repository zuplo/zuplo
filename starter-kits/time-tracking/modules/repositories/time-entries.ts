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
 * The TimeEntry entity. A single span of tracked work for an employee.
 * Status moves draft -> submitted -> approved/rejected.
 */
export interface TimeEntry extends Entity {
  employeeId: string;
  projectId: string;
  taskId: string | null;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  billable: boolean;
  description: string;
  status: "draft" | "submitted" | "approved" | "rejected";
  timesheetId: string | null;
  createdAt: string;
}

function build(): Repository<TimeEntry> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<TimeEntry>({
        provider: "in-memory",
        entityName: "TimeEntry",
      });
    case "supabase":
      return createRepository<TimeEntry>({
        provider: "supabase",
        entityName: "TimeEntry",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_TIME_ENTRIES_TABLE ?? "time_entries",
        },
      });
    case "firestore":
      return createRepository<TimeEntry>({
        provider: "firestore",
        entityName: "TimeEntry",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_TIME_ENTRIES_COLLECTION ?? "time_entries",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<TimeEntry>({
        provider: "upstash-redis",
        entityName: "TimeEntry",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_TIME_ENTRIES_KEY_PREFIX ?? "time_entries",
        },
      });
    case "neon":
      return createRepository<TimeEntry>({
        provider: "neon",
        entityName: "TimeEntry",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_TIME_ENTRIES_TABLE ?? "time_entries",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const timeEntryRepository: Repository<TimeEntry> = build();
