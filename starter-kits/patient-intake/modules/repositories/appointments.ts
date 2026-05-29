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
 * The Appointment entity — a scheduled visit.
 */
export interface Appointment extends Entity {
  patientId: string;
  providerEmail: string;
  scheduledFor: string;
  durationMinutes: number;
  kind: "new" | "followup" | "telehealth" | "procedure";
  status: "scheduled" | "checked_in" | "completed" | "no_show" | "canceled";
  createdAt: string;
}

function build(): Repository<Appointment> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Appointment>({
        provider: "in-memory",
        entityName: "Appointment",
      });
    case "supabase":
      return createRepository<Appointment>({
        provider: "supabase",
        entityName: "Appointment",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_APPOINTMENTS_TABLE ?? "appointments",
        },
      });
    case "firestore":
      return createRepository<Appointment>({
        provider: "firestore",
        entityName: "Appointment",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection:
            environment.FIRESTORE_APPOINTMENTS_COLLECTION ?? "appointments",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Appointment>({
        provider: "upstash-redis",
        entityName: "Appointment",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_APPOINTMENTS_PREFIX ?? "appointments",
        },
      });
    case "neon":
      return createRepository<Appointment>({
        provider: "neon",
        entityName: "Appointment",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_APPOINTMENTS_TABLE ?? "appointments",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const appointmentRepository: Repository<Appointment> = build();
