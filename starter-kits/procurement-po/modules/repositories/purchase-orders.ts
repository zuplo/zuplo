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

/**
 * A purchase order issued to a vendor, derived from an approved PurchaseRequest.
 */
export interface PurchaseOrder extends Entity {
  purchaseRequestId: string;
  vendorId: string;
  poNumber: string;
  totalCents: number;
  currency: string;
  status: "issued" | "received" | "closed";
  issuedAt: string;
}

function build(): Repository<PurchaseOrder> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<PurchaseOrder>({ provider: "in-memory", entityName: "PurchaseOrder" });
    case "supabase":
      return createRepository<PurchaseOrder>({
        provider: "supabase",
        entityName: "PurchaseOrder",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_PURCHASE_ORDERS_TABLE ?? "purchase_orders",
        },
      });
    case "firestore":
      return createRepository<PurchaseOrder>({
        provider: "firestore",
        entityName: "PurchaseOrder",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_PURCHASE_ORDERS_COLLECTION ?? "purchase_orders",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<PurchaseOrder>({
        provider: "upstash-redis",
        entityName: "PurchaseOrder",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_PURCHASE_ORDERS_PREFIX ?? "purchase_orders",
        },
      });
    case "neon":
      return createRepository<PurchaseOrder>({
        provider: "neon",
        entityName: "PurchaseOrder",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_PURCHASE_ORDERS_TABLE ?? "purchase_orders",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const purchaseOrderRepository: Repository<PurchaseOrder> = build();
