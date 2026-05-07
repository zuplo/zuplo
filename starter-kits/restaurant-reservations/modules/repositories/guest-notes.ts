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
 * The GuestNote entity. A timestamped staff note about a guest.
 */
export interface GuestNote extends Entity {
  guestId: string;
  body: string;
  addedBy: string;
  addedAt: string;
}

function build(): Repository<GuestNote> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<GuestNote>({
        provider: "in-memory",
        entityName: "GuestNote",
      });
    case "supabase":
      return createRepository<GuestNote>({
        provider: "supabase",
        entityName: "GuestNote",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_GUEST_NOTES_TABLE ?? "guest_notes",
        },
      });
    case "firestore":
      return createRepository<GuestNote>({
        provider: "firestore",
        entityName: "GuestNote",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection:
            environment.FIRESTORE_GUEST_NOTES_COLLECTION ?? "guest_notes",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<GuestNote>({
        provider: "upstash-redis",
        entityName: "GuestNote",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix:
            environment.UPSTASH_GUEST_NOTES_KEY_PREFIX ?? "guest_notes",
        },
      });
    case "neon":
      return createRepository<GuestNote>({
        provider: "neon",
        entityName: "GuestNote",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_GUEST_NOTES_TABLE ?? "guest_notes",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const guestNoteRepository: Repository<GuestNote> = build();
