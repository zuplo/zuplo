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

/** A recurring (sustaining) gift. */
export interface RecurringGift extends Entity {
  donorId: string;
  amountCents: number;
  currency: string;
  intervalUnit: "monthly" | "quarterly" | "annual";
  nextChargeDate: string;
  status: "active" | "paused" | "canceled";
  createdAt: string;
  /** Stripe subscription id mirroring this gift, when Stripe is configured. */
  stripeSubscriptionId: string | null;
  /** Stripe customer id for the donor. */
  stripeCustomerId: string | null;
}

function build(): Repository<RecurringGift> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<RecurringGift>({ provider: "in-memory", entityName: "RecurringGift" });
    case "supabase":
      return createRepository<RecurringGift>({
        provider: "supabase",
        entityName: "RecurringGift",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_RECURRING_GIFTS_TABLE ?? "recurring_gifts",
        },
      });
    case "firestore":
      return createRepository<RecurringGift>({
        provider: "firestore",
        entityName: "RecurringGift",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_RECURRING_GIFTS_COLLECTION ?? "recurring_gifts",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<RecurringGift>({
        provider: "upstash-redis",
        entityName: "RecurringGift",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_RECURRING_GIFTS_PREFIX ?? "recurring_gifts",
        },
      });
    case "neon":
      return createRepository<RecurringGift>({
        provider: "neon",
        entityName: "RecurringGift",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_RECURRING_GIFTS_TABLE ?? "recurring_gifts",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const recurringGiftRepository: Repository<RecurringGift> = build();
