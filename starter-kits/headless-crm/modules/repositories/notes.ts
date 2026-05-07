import { environment } from "@zuplo/runtime";
import {
  createRepository,
  type DbProvider,
  type Entity,
  type Repository,
} from "@zuplo/starter-kit-shared/adapters";

function requireEnv(name: string): string {
  const value = (environment as Record<string, string | undefined>)[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

/** A free-text note attached to a deal/contact/account. */
export interface Note extends Entity {
  body: string;
  dealId: string | null;
  contactId: string | null;
  accountId: string | null;
  authorEmail: string;
  createdAt: string;
}

function build(): Repository<Note> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Note>({ provider: "in-memory", entityName: "Note" });
    case "supabase":
      return createRepository<Note>({
        provider: "supabase",
        entityName: "Note",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_NOTES_TABLE ?? "notes",
        },
      });
    case "firestore":
      return createRepository<Note>({
        provider: "firestore",
        entityName: "Note",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_NOTES_COLLECTION ?? "notes",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Note>({
        provider: "upstash-redis",
        entityName: "Note",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_NOTES_PREFIX ?? "notes",
        },
      });
    case "neon":
      return createRepository<Note>({
        provider: "neon",
        entityName: "Note",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_NOTES_TABLE ?? "notes",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const noteRepository: Repository<Note> = build();
