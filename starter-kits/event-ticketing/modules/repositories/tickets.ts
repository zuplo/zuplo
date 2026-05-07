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
 * An individual issued ticket with a unique QR code, attached to an order.
 */
export interface Ticket extends Entity {
  orderId: string;
  ticketTypeId: string;
  attendeeName: string;
  attendeeEmail: string;
  qrCode: string;
  status: "valid" | "checked_in" | "voided";
  checkedInAt: string | null;
}

function build(): Repository<Ticket> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Ticket>({ provider: "in-memory", entityName: "Ticket" });
    case "supabase":
      return createRepository<Ticket>({
        provider: "supabase",
        entityName: "Ticket",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_TICKETS_TABLE ?? "tickets",
        },
      });
    case "firestore":
      return createRepository<Ticket>({
        provider: "firestore",
        entityName: "Ticket",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_TICKETS_COLLECTION ?? "tickets",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Ticket>({
        provider: "upstash-redis",
        entityName: "Ticket",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_TICKETS_PREFIX ?? "tickets",
        },
      });
    case "neon":
      return createRepository<Ticket>({
        provider: "neon",
        entityName: "Ticket",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_TICKETS_TABLE ?? "tickets",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const ticketRepository: Repository<Ticket> = build();
