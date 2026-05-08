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
 * A ticket order placed by an attendee for an event.
 */
export interface Order extends Entity {
  eventId: string;
  attendeeEmail: string;
  attendeeName: string;
  totalCents: number;
  currency: string;
  status: "pending" | "paid" | "refunded" | "canceled";
  placedAt: string;
  paidAt: string | null;
  refundedAt: string | null;
  /** Stripe PaymentIntent id, populated when the order is placed. */
  stripePaymentIntentId?: string | null;
  /** Stripe Refund id, populated when the order is refunded. */
  stripeRefundId?: string | null;
}

function build(): Repository<Order> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Order>({ provider: "in-memory", entityName: "Order" });
    case "supabase":
      return createRepository<Order>({
        provider: "supabase",
        entityName: "Order",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_ORDERS_TABLE ?? "orders",
        },
      });
    case "firestore":
      return createRepository<Order>({
        provider: "firestore",
        entityName: "Order",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_ORDERS_COLLECTION ?? "orders",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Order>({
        provider: "upstash-redis",
        entityName: "Order",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_ORDERS_PREFIX ?? "orders",
        },
      });
    case "neon":
      return createRepository<Order>({
        provider: "neon",
        entityName: "Order",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_ORDERS_TABLE ?? "orders",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const orderRepository: Repository<Order> = build();
