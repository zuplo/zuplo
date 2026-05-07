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
 * The Guest entity. A diner profile in the restaurant CRM.
 */
export interface Guest extends Entity {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  totalVisits: number;
  lastVisitAt: string | null;
  vip: boolean;
  allergies: string[];
  preferences: string | null;
  notes: string | null;
}

function build(): Repository<Guest> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Guest>({
        provider: "in-memory",
        entityName: "Guest",
      });
    case "supabase":
      return createRepository<Guest>({
        provider: "supabase",
        entityName: "Guest",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_GUESTS_TABLE ?? "guests",
        },
      });
    case "firestore":
      return createRepository<Guest>({
        provider: "firestore",
        entityName: "Guest",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_GUESTS_COLLECTION ?? "guests",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Guest>({
        provider: "upstash-redis",
        entityName: "Guest",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_GUESTS_KEY_PREFIX ?? "guests",
        },
      });
    case "neon":
      return createRepository<Guest>({
        provider: "neon",
        entityName: "Guest",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_GUESTS_TABLE ?? "guests",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const guestRepository: Repository<Guest> = build();
