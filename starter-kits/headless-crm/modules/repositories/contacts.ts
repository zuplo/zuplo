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

/** A person at an account. */
export interface Contact extends Entity {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  title: string | null;
  accountId: string;
  ownerEmail: string;
  createdAt: string;
}

function build(): Repository<Contact> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Contact>({ provider: "in-memory", entityName: "Contact" });
    case "supabase":
      return createRepository<Contact>({
        provider: "supabase",
        entityName: "Contact",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_CONTACTS_TABLE ?? "contacts",
        },
      });
    case "firestore":
      return createRepository<Contact>({
        provider: "firestore",
        entityName: "Contact",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_CONTACTS_COLLECTION ?? "contacts",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Contact>({
        provider: "upstash-redis",
        entityName: "Contact",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_CONTACTS_PREFIX ?? "contacts",
        },
      });
    case "neon":
      return createRepository<Contact>({
        provider: "neon",
        entityName: "Contact",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_CONTACTS_TABLE ?? "contacts",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const contactRepository: Repository<Contact> = build();
