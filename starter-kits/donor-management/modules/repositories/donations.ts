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

/** A single donation event. */
export interface Donation extends Entity {
  donorId: string;
  campaignId: string | null;
  amountCents: number;
  currency: string;
  receivedAt: string;
  paymentMethod: string;
  taxDeductibleAmountCents: number;
  anonymous: boolean;
  restrictedFund: string | null;
}

function build(): Repository<Donation> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Donation>({ provider: "in-memory", entityName: "Donation" });
    case "supabase":
      return createRepository<Donation>({
        provider: "supabase",
        entityName: "Donation",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_DONATIONS_TABLE ?? "donations",
        },
      });
    case "firestore":
      return createRepository<Donation>({
        provider: "firestore",
        entityName: "Donation",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_DONATIONS_COLLECTION ?? "donations",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Donation>({
        provider: "upstash-redis",
        entityName: "Donation",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_DONATIONS_PREFIX ?? "donations",
        },
      });
    case "neon":
      return createRepository<Donation>({
        provider: "neon",
        entityName: "Donation",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_DONATIONS_TABLE ?? "donations",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const donationRepository: Repository<Donation> = build();
