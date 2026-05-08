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
 * The Reservation entity. The primary booking record for the restaurant.
 */
export interface Reservation extends Entity {
  guestId: string;
  scheduledFor: string;
  partySize: number;
  durationMinutes: number;
  tableId: string | null;
  status: "confirmed" | "seated" | "completed" | "no_show" | "canceled";
  specialRequests: string | null;
  source: "web" | "phone" | "walk_in";
  confirmedAt: string | null;
  seatedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  /** Google Calendar event id for this booking, when synced. */
  calendarEventId?: string | null;
  /** Stripe Checkout Session id for the optional deposit. */
  depositSessionId?: string | null;
  /** Hosted URL for the deposit Checkout — share with the guest. */
  depositUrl?: string | null;
  /** Deposit status mirrored from Stripe webhook events. */
  depositStatus?: "none" | "pending" | "paid" | "refunded" | null;
  /** Deposit amount in cents. */
  depositCents?: number | null;
}

function build(): Repository<Reservation> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Reservation>({
        provider: "in-memory",
        entityName: "Reservation",
      });
    case "supabase":
      return createRepository<Reservation>({
        provider: "supabase",
        entityName: "Reservation",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_RESERVATIONS_TABLE ?? "reservations",
        },
      });
    case "firestore":
      return createRepository<Reservation>({
        provider: "firestore",
        entityName: "Reservation",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection:
            environment.FIRESTORE_RESERVATIONS_COLLECTION ?? "reservations",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Reservation>({
        provider: "upstash-redis",
        entityName: "Reservation",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix:
            environment.UPSTASH_RESERVATIONS_KEY_PREFIX ?? "reservations",
        },
      });
    case "neon":
      return createRepository<Reservation>({
        provider: "neon",
        entityName: "Reservation",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_RESERVATIONS_TABLE ?? "reservations",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const reservationRepository: Repository<Reservation> = build();
