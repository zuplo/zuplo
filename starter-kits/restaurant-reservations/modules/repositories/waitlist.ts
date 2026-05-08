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
 * The Waitlist entity. A walk-in party waiting for a table.
 */
export interface WaitlistEntry extends Entity {
  guestName: string;
  partySize: number;
  addedAt: string;
  quotedWaitMinutes: number;
  status: "waiting" | "seated" | "left";
  quotedReadyAt: string | null;
  /** E.164 phone — used by the no-show recovery orchestrator to text the party. */
  phone?: string | null;
}

function build(): Repository<WaitlistEntry> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<WaitlistEntry>({
        provider: "in-memory",
        entityName: "WaitlistEntry",
      });
    case "supabase":
      return createRepository<WaitlistEntry>({
        provider: "supabase",
        entityName: "WaitlistEntry",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_WAITLIST_TABLE ?? "waitlist",
        },
      });
    case "firestore":
      return createRepository<WaitlistEntry>({
        provider: "firestore",
        entityName: "WaitlistEntry",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_WAITLIST_COLLECTION ?? "waitlist",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<WaitlistEntry>({
        provider: "upstash-redis",
        entityName: "WaitlistEntry",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_WAITLIST_KEY_PREFIX ?? "waitlist",
        },
      });
    case "neon":
      return createRepository<WaitlistEntry>({
        provider: "neon",
        entityName: "WaitlistEntry",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_WAITLIST_TABLE ?? "waitlist",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const waitlistRepository: Repository<WaitlistEntry> = build();
