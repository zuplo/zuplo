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
 * A single form submission. The payload is opaque field data; the gateway
 * sniffs an email and captures IP + UA at submit time.
 */
export interface Submission extends Entity {
  formId: string;
  payload: Record<string, unknown>;
  submitterEmail: string | null;
  ip: string | null;
  userAgent: string | null;
  submittedAt: string;
  score: number | null;
  routedTo: string | null;
  processed: boolean;
  spam: boolean;
}

function build(): Repository<Submission> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Submission>({ provider: "in-memory", entityName: "Submission" });
    case "supabase":
      return createRepository<Submission>({
        provider: "supabase",
        entityName: "Submission",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_SUBMISSIONS_TABLE ?? "submissions",
        },
      });
    case "firestore":
      return createRepository<Submission>({
        provider: "firestore",
        entityName: "Submission",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_SUBMISSIONS_COLLECTION ?? "submissions",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Submission>({
        provider: "upstash-redis",
        entityName: "Submission",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_SUBMISSIONS_PREFIX ?? "submissions",
        },
      });
    case "neon":
      return createRepository<Submission>({
        provider: "neon",
        entityName: "Submission",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_SUBMISSIONS_TABLE ?? "submissions",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const submissionRepository: Repository<Submission> = build();
