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
 * An event that tickets are sold for.
 */
export interface Event extends Entity {
  slug: string;
  name: string;
  description: string;
  venue: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  ticketsSold: number;
  status: "draft" | "on_sale" | "sold_out" | "completed" | "canceled";
}

function build(): Repository<Event> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Event>({ provider: "in-memory", entityName: "Event" });
    case "supabase":
      return createRepository<Event>({
        provider: "supabase",
        entityName: "Event",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_EVENTS_TABLE ?? "events",
        },
      });
    case "firestore":
      return createRepository<Event>({
        provider: "firestore",
        entityName: "Event",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_EVENTS_COLLECTION ?? "events",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Event>({
        provider: "upstash-redis",
        entityName: "Event",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_EVENTS_PREFIX ?? "events",
        },
      });
    case "neon":
      return createRepository<Event>({
        provider: "neon",
        entityName: "Event",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_EVENTS_TABLE ?? "events",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const eventRepository: Repository<Event> = build();
