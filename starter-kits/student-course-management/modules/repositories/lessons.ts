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
 * The Lesson entity — a single class session within a course.
 */
export interface Lesson extends Entity {
  courseId: string;
  title: string;
  description: string;
  scheduledFor: string;
  durationMinutes: number;
  videoUrl: string | null;
  createdAt: string;
}

function build(): Repository<Lesson> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Lesson>({
        provider: "in-memory",
        entityName: "Lesson",
      });
    case "supabase":
      return createRepository<Lesson>({
        provider: "supabase",
        entityName: "Lesson",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_LESSONS_TABLE ?? "lessons",
        },
      });
    case "firestore":
      return createRepository<Lesson>({
        provider: "firestore",
        entityName: "Lesson",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_LESSONS_COLLECTION ?? "lessons",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Lesson>({
        provider: "upstash-redis",
        entityName: "Lesson",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_LESSONS_PREFIX ?? "lessons",
        },
      });
    case "neon":
      return createRepository<Lesson>({
        provider: "neon",
        entityName: "Lesson",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_LESSONS_TABLE ?? "lessons",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const lessonRepository: Repository<Lesson> = build();
