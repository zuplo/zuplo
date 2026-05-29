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
 * The Student entity — the person enrolled in courses.
 */
export interface Student extends Entity {
  firstName: string;
  lastName: string;
  email: string;
  dateOfBirth: string;
  parentEmail: string | null;
  gradeLevel: string;
  status: "active" | "alumni" | "withdrawn";
  createdAt: string;
}

function build(): Repository<Student> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Student>({
        provider: "in-memory",
        entityName: "Student",
      });
    case "supabase":
      return createRepository<Student>({
        provider: "supabase",
        entityName: "Student",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_STUDENTS_TABLE ?? "students",
        },
      });
    case "firestore":
      return createRepository<Student>({
        provider: "firestore",
        entityName: "Student",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_STUDENTS_COLLECTION ?? "students",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Student>({
        provider: "upstash-redis",
        entityName: "Student",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_STUDENTS_PREFIX ?? "students",
        },
      });
    case "neon":
      return createRepository<Student>({
        provider: "neon",
        entityName: "Student",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_STUDENTS_TABLE ?? "students",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const studentRepository: Repository<Student> = build();
