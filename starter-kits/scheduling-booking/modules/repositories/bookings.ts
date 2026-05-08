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
 * The Booking entity — a single scheduled meeting.
 *
 * `calendarEventId` / `zoomMeetingId` are populated when book-meeting
 * created an external calendar event or Zoom meeting, so we can clean up
 * (or update) them on reschedule/cancel.
 */
export interface Booking extends Entity {
  eventTypeSlug: string;
  hostEmail: string;
  attendeeEmail: string;
  attendeeName: string;
  attendeePhone: string | null;
  scheduledFor: string;
  durationMinutes: number;
  status: "confirmed" | "canceled" | "rescheduled" | "completed" | "no_show";
  canceledAt: string | null;
  cancelReason: string | null;
  notes: string | null;
  location: string | null;
  calendarEventId: string | null;
  zoomMeetingId: string | null;
  zoomJoinUrl: string | null;
  createdAt: string;
}

/**
 * The EventType entity — a bookable meeting template (e.g. "30min-intro").
 */
export interface EventType extends Entity {
  slug: string;
  ownerEmail: string;
  name: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  locations: string[];
  availableHours: string;
  active: boolean;
  createdAt: string;
}

/**
 * The Availability entity — a host's recurring weekly available window.
 */
export interface Availability extends Entity {
  ownerEmail: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  timezone: string;
  createdAt: string;
}

/**
 * The BufferRule entity — extra padding around meetings.
 */
export interface BufferRule extends Entity {
  ownerEmail: string;
  beforeMinutes: number;
  afterMinutes: number;
  applies: "all" | "first_meeting" | "last_meeting";
  createdAt: string;
}

/**
 * The Cancellation entity — audit record when a booking is canceled.
 */
export interface Cancellation extends Entity {
  bookingId: string;
  canceledBy: string;
  reason: string;
  canceledAt: string;
  createdAt: string;
}

function buildBookings(): Repository<Booking> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Booking>({ provider: "in-memory", entityName: "Booking" });
    case "supabase":
      return createRepository<Booking>({
        provider: "supabase",
        entityName: "Booking",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_BOOKINGS_TABLE ?? "bookings",
        },
      });
    case "firestore":
      return createRepository<Booking>({
        provider: "firestore",
        entityName: "Booking",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_BOOKINGS_COLLECTION ?? "bookings",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Booking>({
        provider: "upstash-redis",
        entityName: "Booking",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_BOOKINGS_PREFIX ?? "bookings",
        },
      });
    case "neon":
      return createRepository<Booking>({
        provider: "neon",
        entityName: "Booking",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_BOOKINGS_TABLE ?? "bookings",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildEventTypes(): Repository<EventType> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<EventType>({ provider: "in-memory", entityName: "EventType" });
    case "supabase":
      return createRepository<EventType>({
        provider: "supabase",
        entityName: "EventType",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_EVENT_TYPES_TABLE ?? "event_types",
        },
      });
    case "firestore":
      return createRepository<EventType>({
        provider: "firestore",
        entityName: "EventType",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_EVENT_TYPES_COLLECTION ?? "event_types",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<EventType>({
        provider: "upstash-redis",
        entityName: "EventType",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_EVENT_TYPES_PREFIX ?? "event_types",
        },
      });
    case "neon":
      return createRepository<EventType>({
        provider: "neon",
        entityName: "EventType",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_EVENT_TYPES_TABLE ?? "event_types",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildAvailability(): Repository<Availability> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Availability>({ provider: "in-memory", entityName: "Availability" });
    case "supabase":
      return createRepository<Availability>({
        provider: "supabase",
        entityName: "Availability",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_AVAILABILITY_TABLE ?? "availability",
        },
      });
    case "firestore":
      return createRepository<Availability>({
        provider: "firestore",
        entityName: "Availability",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_AVAILABILITY_COLLECTION ?? "availability",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Availability>({
        provider: "upstash-redis",
        entityName: "Availability",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_AVAILABILITY_PREFIX ?? "availability",
        },
      });
    case "neon":
      return createRepository<Availability>({
        provider: "neon",
        entityName: "Availability",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_AVAILABILITY_TABLE ?? "availability",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildBufferRules(): Repository<BufferRule> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<BufferRule>({ provider: "in-memory", entityName: "BufferRule" });
    case "supabase":
      return createRepository<BufferRule>({
        provider: "supabase",
        entityName: "BufferRule",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_BUFFER_RULES_TABLE ?? "buffer_rules",
        },
      });
    case "firestore":
      return createRepository<BufferRule>({
        provider: "firestore",
        entityName: "BufferRule",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_BUFFER_RULES_COLLECTION ?? "buffer_rules",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<BufferRule>({
        provider: "upstash-redis",
        entityName: "BufferRule",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_BUFFER_RULES_PREFIX ?? "buffer_rules",
        },
      });
    case "neon":
      return createRepository<BufferRule>({
        provider: "neon",
        entityName: "BufferRule",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_BUFFER_RULES_TABLE ?? "buffer_rules",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildCancellations(): Repository<Cancellation> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Cancellation>({ provider: "in-memory", entityName: "Cancellation" });
    case "supabase":
      return createRepository<Cancellation>({
        provider: "supabase",
        entityName: "Cancellation",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_CANCELLATIONS_TABLE ?? "cancellations",
        },
      });
    case "firestore":
      return createRepository<Cancellation>({
        provider: "firestore",
        entityName: "Cancellation",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_CANCELLATIONS_COLLECTION ?? "cancellations",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Cancellation>({
        provider: "upstash-redis",
        entityName: "Cancellation",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_CANCELLATIONS_PREFIX ?? "cancellations",
        },
      });
    case "neon":
      return createRepository<Cancellation>({
        provider: "neon",
        entityName: "Cancellation",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_CANCELLATIONS_TABLE ?? "cancellations",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const bookingRepository: Repository<Booking> = buildBookings();
export const eventTypeRepository: Repository<EventType> = buildEventTypes();
export const availabilityRepository: Repository<Availability> = buildAvailability();
export const bufferRuleRepository: Repository<BufferRule> = buildBufferRules();
export const cancellationRepository: Repository<Cancellation> = buildCancellations();
