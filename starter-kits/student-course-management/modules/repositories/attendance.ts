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
 * The Attendance entity — one row per (lesson, student) pair recording
 * whether the student showed up.
 */
export interface Attendance extends Entity {
  lessonId: string;
  studentId: string;
  status: "present" | "absent" | "late" | "excused";
  markedAt: string;
}

function build(): Repository<Attendance> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Attendance>({
        provider: "in-memory",
        entityName: "Attendance",
      });
    case "supabase":
      return createRepository<Attendance>({
        provider: "supabase",
        entityName: "Attendance",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_ATTENDANCE_TABLE ?? "attendance",
        },
      });
    case "firestore":
      return createRepository<Attendance>({
        provider: "firestore",
        entityName: "Attendance",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_ATTENDANCE_COLLECTION ?? "attendance",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Attendance>({
        provider: "upstash-redis",
        entityName: "Attendance",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_ATTENDANCE_PREFIX ?? "attendance",
        },
      });
    case "neon":
      return createRepository<Attendance>({
        provider: "neon",
        entityName: "Attendance",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_ATTENDANCE_TABLE ?? "attendance",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const attendanceRepository: Repository<Attendance> = build();
