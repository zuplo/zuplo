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
 * The Invoice entity.
 */
export interface Invoice extends Entity {
  customerId: string;
  number: string;
  status: "draft" | "sent" | "paid" | "overdue" | "void";
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  dueDate: string;
  sentAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

/**
 * A line item on an invoice.
 */
export interface LineItem extends Entity {
  invoiceId: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxRate: number;
  createdAt: string;
}

/**
 * A customer who can be billed.
 */
export interface Customer extends Entity {
  name: string;
  email: string;
  billingAddress: string;
  currency: string;
  createdAt: string;
}

/**
 * A payment recorded against an invoice.
 */
export interface Payment extends Entity {
  invoiceId: string;
  amountCents: number;
  method: string;
  paidAt: string;
  reference: string;
  createdAt: string;
}

function buildInvoices(): Repository<Invoice> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Invoice>({ provider: "in-memory", entityName: "Invoice" });
    case "supabase":
      return createRepository<Invoice>({
        provider: "supabase",
        entityName: "Invoice",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_INVOICES_TABLE ?? "invoices",
        },
      });
    case "firestore":
      return createRepository<Invoice>({
        provider: "firestore",
        entityName: "Invoice",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_INVOICES_COLLECTION ?? "invoices",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Invoice>({
        provider: "upstash-redis",
        entityName: "Invoice",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_INVOICES_PREFIX ?? "invoices",
        },
      });
    case "neon":
      return createRepository<Invoice>({
        provider: "neon",
        entityName: "Invoice",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_INVOICES_TABLE ?? "invoices",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildLineItems(): Repository<LineItem> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<LineItem>({ provider: "in-memory", entityName: "LineItem" });
    case "supabase":
      return createRepository<LineItem>({
        provider: "supabase",
        entityName: "LineItem",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_LINE_ITEMS_TABLE ?? "line_items",
        },
      });
    case "firestore":
      return createRepository<LineItem>({
        provider: "firestore",
        entityName: "LineItem",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_LINE_ITEMS_COLLECTION ?? "line_items",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<LineItem>({
        provider: "upstash-redis",
        entityName: "LineItem",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_LINE_ITEMS_PREFIX ?? "line_items",
        },
      });
    case "neon":
      return createRepository<LineItem>({
        provider: "neon",
        entityName: "LineItem",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_LINE_ITEMS_TABLE ?? "line_items",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildCustomers(): Repository<Customer> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Customer>({ provider: "in-memory", entityName: "Customer" });
    case "supabase":
      return createRepository<Customer>({
        provider: "supabase",
        entityName: "Customer",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_CUSTOMERS_TABLE ?? "customers",
        },
      });
    case "firestore":
      return createRepository<Customer>({
        provider: "firestore",
        entityName: "Customer",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_CUSTOMERS_COLLECTION ?? "customers",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Customer>({
        provider: "upstash-redis",
        entityName: "Customer",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_CUSTOMERS_PREFIX ?? "customers",
        },
      });
    case "neon":
      return createRepository<Customer>({
        provider: "neon",
        entityName: "Customer",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_CUSTOMERS_TABLE ?? "customers",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildPayments(): Repository<Payment> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Payment>({ provider: "in-memory", entityName: "Payment" });
    case "supabase":
      return createRepository<Payment>({
        provider: "supabase",
        entityName: "Payment",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_PAYMENTS_TABLE ?? "payments",
        },
      });
    case "firestore":
      return createRepository<Payment>({
        provider: "firestore",
        entityName: "Payment",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_PAYMENTS_COLLECTION ?? "payments",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Payment>({
        provider: "upstash-redis",
        entityName: "Payment",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_PAYMENTS_PREFIX ?? "payments",
        },
      });
    case "neon":
      return createRepository<Payment>({
        provider: "neon",
        entityName: "Payment",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_PAYMENTS_TABLE ?? "payments",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const invoiceRepository: Repository<Invoice> = buildInvoices();
export const lineItemRepository: Repository<LineItem> = buildLineItems();
export const customerRepository: Repository<Customer> = buildCustomers();
export const paymentRepository: Repository<Payment> = buildPayments();
