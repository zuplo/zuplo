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
 * The IntakeSubmission entity — primary entity of this kit.
 *
 * One row per submitted intake form. `payload` holds the raw answers
 * keyed by field id (the shape is owned by the matching IntakeForm).
 */
export interface IntakeSubmission extends Entity {
  patientId: string;
  formId: string;
  payload: Record<string, unknown>;
  status: "received" | "in_review" | "completed" | "flagged";
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
}

function build(): Repository<IntakeSubmission> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<IntakeSubmission>({
        provider: "in-memory",
        entityName: "IntakeSubmission",
      });
    case "supabase":
      return createRepository<IntakeSubmission>({
        provider: "supabase",
        entityName: "IntakeSubmission",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_INTAKE_SUBMISSIONS_TABLE ?? "intake_submissions",
        },
      });
    case "firestore":
      return createRepository<IntakeSubmission>({
        provider: "firestore",
        entityName: "IntakeSubmission",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection:
            environment.FIRESTORE_INTAKE_SUBMISSIONS_COLLECTION ?? "intake_submissions",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<IntakeSubmission>({
        provider: "upstash-redis",
        entityName: "IntakeSubmission",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_INTAKE_SUBMISSIONS_PREFIX ?? "intake_submissions",
        },
      });
    case "neon":
      return createRepository<IntakeSubmission>({
        provider: "neon",
        entityName: "IntakeSubmission",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_INTAKE_SUBMISSIONS_TABLE ?? "intake_submissions",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const intakeSubmissionRepository: Repository<IntakeSubmission> = build();
