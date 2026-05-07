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
 * The Bill entity.
 */
export interface Bill extends Entity {
  vendorId: string;
  billNumber: string;
  amountCents: number;
  currency: string;
  dueDate: string;
  status: "draft" | "pending_approval" | "approved" | "paid" | "void";
  glCode: string;
  poNumber: string | null;
  attachmentUrl: string | null;
  approverEmail: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

/**
 * A Vendor that bills you.
 */
export interface Vendor extends Entity {
  name: string;
  email: string;
  paymentTerms: number;
  currency: string;
  paymentMethod: "check" | "ach" | "wire";
  createdAt: string;
}

/**
 * Approval record for a bill.
 */
export interface BillApproval extends Entity {
  billId: string;
  approverEmail: string;
  decision: "approved" | "rejected";
  reason: string;
  decidedAt: string;
  createdAt: string;
}

/**
 * A scheduled or completed payment for a bill.
 */
export interface BillPayment extends Entity {
  billId: string;
  amountCents: number;
  method: string;
  scheduledFor: string;
  paidAt: string | null;
  reference: string;
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

export const billRepository: Repository<Bill> = builder<Bill>("Bill", "bills", "BILLS");
export const vendorRepository: Repository<Vendor> = builder<Vendor>("Vendor", "vendors", "VENDORS");
export const billApprovalRepository: Repository<BillApproval> = builder<BillApproval>("BillApproval", "bill_approvals", "BILL_APPROVALS");
export const billPaymentRepository: Repository<BillPayment> = builder<BillPayment>("BillPayment", "bill_payments", "BILL_PAYMENTS");
