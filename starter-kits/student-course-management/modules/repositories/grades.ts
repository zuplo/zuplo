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
 * The Grade entity — a single graded assignment, quiz, exam, or
 * participation score recorded against an enrollment.
 */
export interface Grade extends Entity {
  enrollmentId: string;
  lessonId: string | null;
  kind: "assignment" | "quiz" | "exam" | "participation";
  score: number;
  maxScore: number;
  gradedAt: string;
  feedback: string | null;
}

function build(): Repository<Grade> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Grade>({
        provider: "in-memory",
        entityName: "Grade",
      });
    case "supabase":
      return createRepository<Grade>({
        provider: "supabase",
        entityName: "Grade",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_GRADES_TABLE ?? "grades",
        },
      });
    case "firestore":
      return createRepository<Grade>({
        provider: "firestore",
        entityName: "Grade",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_GRADES_COLLECTION ?? "grades",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Grade>({
        provider: "upstash-redis",
        entityName: "Grade",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_GRADES_PREFIX ?? "grades",
        },
      });
    case "neon":
      return createRepository<Grade>({
        provider: "neon",
        entityName: "Grade",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_GRADES_TABLE ?? "grades",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const gradeRepository: Repository<Grade> = build();
