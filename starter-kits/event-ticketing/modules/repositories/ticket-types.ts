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
 * A purchasable ticket tier under an event (e.g. General, VIP, Early Bird).
 */
export interface TicketType extends Entity {
  eventId: string;
  name: string;
  priceCents: number;
  quantity: number;
  soldQuantity: number;
  salesStart: string;
  salesEnd: string;
}

function build(): Repository<TicketType> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<TicketType>({ provider: "in-memory", entityName: "TicketType" });
    case "supabase":
      return createRepository<TicketType>({
        provider: "supabase",
        entityName: "TicketType",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_TICKET_TYPES_TABLE ?? "ticket_types",
        },
      });
    case "firestore":
      return createRepository<TicketType>({
        provider: "firestore",
        entityName: "TicketType",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_TICKET_TYPES_COLLECTION ?? "ticket_types",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<TicketType>({
        provider: "upstash-redis",
        entityName: "TicketType",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_TICKET_TYPES_PREFIX ?? "ticket_types",
        },
      });
    case "neon":
      return createRepository<TicketType>({
        provider: "neon",
        entityName: "TicketType",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_TICKET_TYPES_TABLE ?? "ticket_types",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const ticketTypeRepository: Repository<TicketType> = build();
