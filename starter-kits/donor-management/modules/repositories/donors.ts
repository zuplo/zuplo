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

/** A donor — individual or organization. */
export interface Donor extends Entity {
  firstName: string;
  lastName: string;
  email: string;
  mailingAddress: string | null;
  donorType: "individual" | "organization";
  lifetimeGivingCents: number;
  lastGiftDate: string | null;
  giftCount: number;
  status: "active" | "lapsed" | "do_not_contact";
  createdAt: string;
}

function build(): Repository<Donor> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Donor>({ provider: "in-memory", entityName: "Donor" });
    case "supabase":
      return createRepository<Donor>({
        provider: "supabase",
        entityName: "Donor",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_DONORS_TABLE ?? "donors",
        },
      });
    case "firestore":
      return createRepository<Donor>({
        provider: "firestore",
        entityName: "Donor",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_DONORS_COLLECTION ?? "donors",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Donor>({
        provider: "upstash-redis",
        entityName: "Donor",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_DONORS_PREFIX ?? "donors",
        },
      });
    case "neon":
      return createRepository<Donor>({
        provider: "neon",
        entityName: "Donor",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_DONORS_TABLE ?? "donors",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const donorRepository: Repository<Donor> = build();
