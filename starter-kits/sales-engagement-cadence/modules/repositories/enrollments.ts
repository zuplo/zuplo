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
 * An Enrollment — the binding between a Prospect and a Cadence, owned by
 * a single rep. Status drives the engagement state machine.
 */
export interface Enrollment extends Entity {
  prospectId: string;
  cadenceId: string;
  repEmail: string;
  status: "active" | "paused" | "completed" | "replied" | "opted_out";
  currentStep: number;
  startedAt: string;
  lastActivityAt: string;
}

function build(): Repository<Enrollment> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Enrollment>({ provider: "in-memory", entityName: "Enrollment" });
    case "supabase":
      return createRepository<Enrollment>({
        provider: "supabase",
        entityName: "Enrollment",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_ENROLLMENTS_TABLE ?? "enrollments",
        },
      });
    case "firestore":
      return createRepository<Enrollment>({
        provider: "firestore",
        entityName: "Enrollment",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_ENROLLMENTS_COLLECTION ?? "enrollments",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Enrollment>({
        provider: "upstash-redis",
        entityName: "Enrollment",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_ENROLLMENTS_PREFIX ?? "enrollments",
        },
      });
    case "neon":
      return createRepository<Enrollment>({
        provider: "neon",
        entityName: "Enrollment",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_ENROLLMENTS_TABLE ?? "enrollments",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const enrollmentRepository: Repository<Enrollment> = build();
