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
 * The Subscription entity.
 */
export interface Subscription extends Entity {
  customerId: string;
  planId: string;
  status: "active" | "past_due" | "canceled" | "paused";
  startDate: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialEnd: string | null;
  canceledAt: string | null;
  createdAt: string;
}

/**
 * A pricing Plan a customer can subscribe to.
 */
export interface Plan extends Entity {
  name: string;
  intervalUnit: "month" | "year";
  priceCents: number;
  currency: string;
  includedUsage: number;
  overageRateCents: number;
  createdAt: string;
}

/**
 * A billing customer.
 */
export interface Customer extends Entity {
  name: string;
  email: string;
  paymentMethodLast4: string;
  createdAt: string;
}

/**
 * A usage record reported against a subscription.
 */
export interface UsageRecord extends Entity {
  subscriptionId: string;
  quantity: number;
  recordedAt: string;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
}

/**
 * An invoice generated against a subscription period.
 */
export interface BillingInvoice extends Entity {
  subscriptionId: string;
  periodStart: string;
  periodEnd: string;
  totalCents: number;
  status: "open" | "paid" | "failed";
  createdAt: string;
}

function builder<T extends Entity>(entityName: string, defaultTable: string, providerEnvOverride: string): Repository<T> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<T>({ provider: "in-memory", entityName });
    case "supabase":
      return createRepository<T>({
        provider: "supabase",
        entityName,
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: (environment as Record<string, string | undefined>)[`SUPABASE_${providerEnvOverride}_TABLE`] ?? defaultTable,
        },
      });
    case "firestore":
      return createRepository<T>({
        provider: "firestore",
        entityName,
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: (environment as Record<string, string | undefined>)[`FIRESTORE_${providerEnvOverride}_COLLECTION`] ?? defaultTable,
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<T>({
        provider: "upstash-redis",
        entityName,
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: (environment as Record<string, string | undefined>)[`UPSTASH_${providerEnvOverride}_PREFIX`] ?? defaultTable,
        },
      });
    case "neon":
      return createRepository<T>({
        provider: "neon",
        entityName,
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: (environment as Record<string, string | undefined>)[`NEON_${providerEnvOverride}_TABLE`] ?? defaultTable,
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const subscriptionRepository: Repository<Subscription> = builder<Subscription>(
  "Subscription",
  "subscriptions",
  "SUBSCRIPTIONS",
);
export const planRepository: Repository<Plan> = builder<Plan>("Plan", "plans", "PLANS");
export const customerRepository: Repository<Customer> = builder<Customer>(
  "Customer",
  "customers",
  "CUSTOMERS",
);
export const usageRepository: Repository<UsageRecord> = builder<UsageRecord>(
  "UsageRecord",
  "usage_records",
  "USAGE_RECORDS",
);
export const billingInvoiceRepository: Repository<BillingInvoice> = builder<BillingInvoice>(
  "BillingInvoice",
  "billing_invoices",
  "BILLING_INVOICES",
);
