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
 * A pre-PO request raised by an employee for a future purchase.
 */
export interface PurchaseRequest extends Entity {
  requesterEmail: string;
  vendorId: string;
  totalCents: number;
  currency: string;
  costCenter: string;
  justification: string;
  status: "draft" | "submitted" | "approved" | "rejected" | "converted_to_po";
  approverEmail: string | null;
  approvedAt: string | null;
  rush: boolean;
  createdAt: string;
}

function build(): Repository<PurchaseRequest> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<PurchaseRequest>({ provider: "in-memory", entityName: "PurchaseRequest" });
    case "supabase":
      return createRepository<PurchaseRequest>({
        provider: "supabase",
        entityName: "PurchaseRequest",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_PURCHASE_REQUESTS_TABLE ?? "purchase_requests",
        },
      });
    case "firestore":
      return createRepository<PurchaseRequest>({
        provider: "firestore",
        entityName: "PurchaseRequest",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_PURCHASE_REQUESTS_COLLECTION ?? "purchase_requests",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<PurchaseRequest>({
        provider: "upstash-redis",
        entityName: "PurchaseRequest",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_PURCHASE_REQUESTS_PREFIX ?? "purchase_requests",
        },
      });
    case "neon":
      return createRepository<PurchaseRequest>({
        provider: "neon",
        entityName: "PurchaseRequest",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_PURCHASE_REQUESTS_TABLE ?? "purchase_requests",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const purchaseRequestRepository: Repository<PurchaseRequest> = build();
