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
 * The Interview entity. A scheduled conversation tied to a single Application.
 * When the kit's schedule_interview handler is called with a candidateEmail,
 * a Google Calendar event is created and the eventId/link are persisted here
 * for later cancellation or rescheduling.
 */
export interface Interview extends Entity {
  applicationId: string;
  scheduledAt: string;
  kind: "phone" | "onsite" | "technical";
  interviewerEmail: string;
  candidateEmail: string | null;
  durationMinutes: number | null;
  calendarEventId: string | null;
  calendarEventLink: string | null;
  meetLink: string | null;
  calendarError: string | null;
  createdAt: string;
}

function build(): Repository<Interview> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Interview>({ provider: "in-memory", entityName: "Interview" });
    case "supabase":
      return createRepository<Interview>({
        provider: "supabase",
        entityName: "Interview",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_INTERVIEWS_TABLE ?? "interviews",
        },
      });
    case "firestore":
      return createRepository<Interview>({
        provider: "firestore",
        entityName: "Interview",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_INTERVIEWS_COLLECTION ?? "interviews",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Interview>({
        provider: "upstash-redis",
        entityName: "Interview",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_INTERVIEWS_KEY_PREFIX ?? "interviews",
        },
      });
    case "neon":
      return createRepository<Interview>({
        provider: "neon",
        entityName: "Interview",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_INTERVIEWS_TABLE ?? "interviews",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const interviewRepository: Repository<Interview> = build();
