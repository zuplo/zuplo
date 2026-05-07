import { environment } from "@zuplo/runtime";
import {
  createRepository,
  type DbProvider,
  type Entity,
  type Repository,
} from "../_shared/adapters/index.ts";

function requireEnv(name: string): string {
  const value = (environment as Record<string, string | undefined>)[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

/**
 * A scheduled meeting between a Lead and a rep — discovery or demo.
 */
export interface MeetingBooking extends Entity {
  leadId: string;
  repEmail: string;
  scheduledFor: string;
  kind: "discovery" | "demo";
  status: "scheduled" | "completed" | "no_show";
}

function build(): Repository<MeetingBooking> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<MeetingBooking>({ provider: "in-memory", entityName: "MeetingBooking" });
    case "supabase":
      return createRepository<MeetingBooking>({
        provider: "supabase",
        entityName: "MeetingBooking",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_MEETINGS_TABLE ?? "meeting_bookings",
        },
      });
    case "firestore":
      return createRepository<MeetingBooking>({
        provider: "firestore",
        entityName: "MeetingBooking",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_MEETINGS_COLLECTION ?? "meeting_bookings",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<MeetingBooking>({
        provider: "upstash-redis",
        entityName: "MeetingBooking",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_MEETINGS_PREFIX ?? "meeting_bookings",
        },
      });
    case "neon":
      return createRepository<MeetingBooking>({
        provider: "neon",
        entityName: "MeetingBooking",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_MEETINGS_TABLE ?? "meeting_bookings",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const meetingBookingRepository: Repository<MeetingBooking> = build();
