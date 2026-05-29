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
 * The Job entity. An open requisition candidates can apply to.
 */
export interface Job extends Entity {
  title: string;
  department: string;
  location: string;
  requisitionId: string;
  status: "open" | "closed";
  description: string;
  createdAt: string;
}

function build(): Repository<Job> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Job>({ provider: "in-memory", entityName: "Job" });
    case "supabase":
      return createRepository<Job>({
        provider: "supabase",
        entityName: "Job",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_JOBS_TABLE ?? "jobs",
        },
      });
    case "firestore":
      return createRepository<Job>({
        provider: "firestore",
        entityName: "Job",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_JOBS_COLLECTION ?? "jobs",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Job>({
        provider: "upstash-redis",
        entityName: "Job",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_JOBS_KEY_PREFIX ?? "jobs",
        },
      });
    case "neon":
      return createRepository<Job>({
        provider: "neon",
        entityName: "Job",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_JOBS_TABLE ?? "jobs",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const jobRepository: Repository<Job> = build();
