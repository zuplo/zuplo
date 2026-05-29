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
 * The Expense entity.
 */
export interface Expense extends Entity {
  employeeEmail: string;
  amountCents: number;
  currency: string;
  merchant: string;
  category: string;
  date: string;
  description: string;
  receiptUrl: string | null;
  status: "draft" | "submitted" | "approved" | "rejected" | "reimbursed";
  policyViolation: boolean;
  createdAt: string;
}

/**
 * An expense category in the chart-of-accounts catalog.
 */
export interface ExpenseCategory extends Entity {
  name: string;
  glCode: string;
  requiresReceipt: boolean;
  maxAmountCents: number | null;
  createdAt: string;
}

/**
 * An expense policy — daily / per-diem / receipt thresholds.
 */
export interface ExpensePolicy extends Entity {
  name: string;
  dailyLimitCents: number;
  perDiemLimitCents: number;
  requireReceiptAbove: number;
  createdAt: string;
}

/**
 * A reimbursement bundle (one or more approved expenses).
 */
export interface Reimbursement extends Entity {
  employeeEmail: string;
  expenseIds: string[];
  totalCents: number;
  status: "pending" | "paid";
  paidAt: string | null;
  createdAt: string;
}

function buildExpenses(): Repository<Expense> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Expense>({ provider: "in-memory", entityName: "Expense" });
    case "supabase":
      return createRepository<Expense>({
        provider: "supabase",
        entityName: "Expense",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_EXPENSES_TABLE ?? "expenses",
        },
      });
    case "firestore":
      return createRepository<Expense>({
        provider: "firestore",
        entityName: "Expense",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_EXPENSES_COLLECTION ?? "expenses",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Expense>({
        provider: "upstash-redis",
        entityName: "Expense",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_EXPENSES_PREFIX ?? "expenses",
        },
      });
    case "neon":
      return createRepository<Expense>({
        provider: "neon",
        entityName: "Expense",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_EXPENSES_TABLE ?? "expenses",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildCategories(): Repository<ExpenseCategory> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<ExpenseCategory>({ provider: "in-memory", entityName: "ExpenseCategory" });
    case "supabase":
      return createRepository<ExpenseCategory>({
        provider: "supabase",
        entityName: "ExpenseCategory",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_CATEGORIES_TABLE ?? "expense_categories",
        },
      });
    case "firestore":
      return createRepository<ExpenseCategory>({
        provider: "firestore",
        entityName: "ExpenseCategory",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_CATEGORIES_COLLECTION ?? "expense_categories",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<ExpenseCategory>({
        provider: "upstash-redis",
        entityName: "ExpenseCategory",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_CATEGORIES_PREFIX ?? "expense_categories",
        },
      });
    case "neon":
      return createRepository<ExpenseCategory>({
        provider: "neon",
        entityName: "ExpenseCategory",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_CATEGORIES_TABLE ?? "expense_categories",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildPolicies(): Repository<ExpensePolicy> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<ExpensePolicy>({ provider: "in-memory", entityName: "ExpensePolicy" });
    case "supabase":
      return createRepository<ExpensePolicy>({
        provider: "supabase",
        entityName: "ExpensePolicy",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_POLICIES_TABLE ?? "expense_policies",
        },
      });
    case "firestore":
      return createRepository<ExpensePolicy>({
        provider: "firestore",
        entityName: "ExpensePolicy",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_POLICIES_COLLECTION ?? "expense_policies",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<ExpensePolicy>({
        provider: "upstash-redis",
        entityName: "ExpensePolicy",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_POLICIES_PREFIX ?? "expense_policies",
        },
      });
    case "neon":
      return createRepository<ExpensePolicy>({
        provider: "neon",
        entityName: "ExpensePolicy",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_POLICIES_TABLE ?? "expense_policies",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildReimbursements(): Repository<Reimbursement> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Reimbursement>({ provider: "in-memory", entityName: "Reimbursement" });
    case "supabase":
      return createRepository<Reimbursement>({
        provider: "supabase",
        entityName: "Reimbursement",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_REIMBURSEMENTS_TABLE ?? "reimbursements",
        },
      });
    case "firestore":
      return createRepository<Reimbursement>({
        provider: "firestore",
        entityName: "Reimbursement",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_REIMBURSEMENTS_COLLECTION ?? "reimbursements",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Reimbursement>({
        provider: "upstash-redis",
        entityName: "Reimbursement",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_REIMBURSEMENTS_PREFIX ?? "reimbursements",
        },
      });
    case "neon":
      return createRepository<Reimbursement>({
        provider: "neon",
        entityName: "Reimbursement",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_REIMBURSEMENTS_TABLE ?? "reimbursements",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const expenseRepository: Repository<Expense> = buildExpenses();
export const categoryRepository: Repository<ExpenseCategory> = buildCategories();
export const policyRepository: Repository<ExpensePolicy> = buildPolicies();
export const reimbursementRepository: Repository<Reimbursement> = buildReimbursements();
