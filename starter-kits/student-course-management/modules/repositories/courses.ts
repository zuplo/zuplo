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
 * The Course entity — a class students enroll in.
 */
export interface Course extends Entity {
  slug: string;
  name: string;
  description: string;
  instructorEmail: string;
  startDate: string;
  endDate: string;
  capacity: number;
  schedule: string;
  createdAt: string;
}

function build(): Repository<Course> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Course>({
        provider: "in-memory",
        entityName: "Course",
      });
    case "supabase":
      return createRepository<Course>({
        provider: "supabase",
        entityName: "Course",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_COURSES_TABLE ?? "courses",
        },
      });
    case "firestore":
      return createRepository<Course>({
        provider: "firestore",
        entityName: "Course",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_COURSES_COLLECTION ?? "courses",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Course>({
        provider: "upstash-redis",
        entityName: "Course",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_COURSES_PREFIX ?? "courses",
        },
      });
    case "neon":
      return createRepository<Course>({
        provider: "neon",
        entityName: "Course",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_COURSES_TABLE ?? "courses",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const courseRepository: Repository<Course> = build();
