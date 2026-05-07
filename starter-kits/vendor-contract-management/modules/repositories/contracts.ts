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
 * A contract with a vendor.
 */
export interface Contract extends Entity {
  vendorId: string;
  title: string;
  kind: "subscription" | "saas" | "services" | "nda" | "msa" | "sow";
  startDate: string;
  endDate: string;
  autoRenews: boolean;
  noticePeriodDays: number;
  annualValueCents: number;
  currency: string;
  status: "draft" | "active" | "expired" | "terminated";
  documentUrl: string | null;
  owner: string;
}

/**
 * A vendor in the directory.
 */
export interface Vendor extends Entity {
  name: string;
  contactEmail: string;
  website: string | null;
  category: string;
  totalSpendCents: number;
  status: "active" | "inactive";
}

/**
 * An upcoming or in-progress renewal action on a contract.
 */
export interface Renewal extends Entity {
  contractId: string;
  dueDate: string;
  action: "renew" | "renegotiate" | "terminate";
  status: "upcoming" | "in_progress" | "completed";
  outcome: string | null;
  completedAt: string | null;
}

/**
 * A risk assessment performed on a vendor.
 */
export interface RiskAssessment extends Entity {
  vendorId: string;
  kind: "security" | "financial" | "compliance" | "data_privacy";
  level: "low" | "med" | "high";
  notes: string;
  assessedAt: string;
  assessedBy: string;
}

/**
 * A spend record bucketed by period for a vendor (e.g. monthly invoice rollup).
 */
export interface SpendRecord extends Entity {
  vendorId: string;
  periodStart: string;
  periodEnd: string;
  amountCents: number;
  source: string;
}

function buildContracts(): Repository<Contract> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Contract>({ provider: "in-memory", entityName: "Contract" });
    case "supabase":
      return createRepository<Contract>({
        provider: "supabase",
        entityName: "Contract",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_CONTRACTS_TABLE ?? "contracts",
        },
      });
    case "firestore":
      return createRepository<Contract>({
        provider: "firestore",
        entityName: "Contract",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_CONTRACTS_COLLECTION ?? "contracts",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Contract>({
        provider: "upstash-redis",
        entityName: "Contract",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_CONTRACTS_PREFIX ?? "contracts",
        },
      });
    case "neon":
      return createRepository<Contract>({
        provider: "neon",
        entityName: "Contract",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_CONTRACTS_TABLE ?? "contracts",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildVendors(): Repository<Vendor> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Vendor>({ provider: "in-memory", entityName: "Vendor" });
    case "supabase":
      return createRepository<Vendor>({
        provider: "supabase",
        entityName: "Vendor",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_VENDORS_TABLE ?? "vendors",
        },
      });
    case "firestore":
      return createRepository<Vendor>({
        provider: "firestore",
        entityName: "Vendor",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_VENDORS_COLLECTION ?? "vendors",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Vendor>({
        provider: "upstash-redis",
        entityName: "Vendor",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_VENDORS_PREFIX ?? "vendors",
        },
      });
    case "neon":
      return createRepository<Vendor>({
        provider: "neon",
        entityName: "Vendor",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_VENDORS_TABLE ?? "vendors",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildRenewals(): Repository<Renewal> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Renewal>({ provider: "in-memory", entityName: "Renewal" });
    case "supabase":
      return createRepository<Renewal>({
        provider: "supabase",
        entityName: "Renewal",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_RENEWALS_TABLE ?? "renewals",
        },
      });
    case "firestore":
      return createRepository<Renewal>({
        provider: "firestore",
        entityName: "Renewal",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_RENEWALS_COLLECTION ?? "renewals",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Renewal>({
        provider: "upstash-redis",
        entityName: "Renewal",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_RENEWALS_PREFIX ?? "renewals",
        },
      });
    case "neon":
      return createRepository<Renewal>({
        provider: "neon",
        entityName: "Renewal",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_RENEWALS_TABLE ?? "renewals",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildRiskAssessments(): Repository<RiskAssessment> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<RiskAssessment>({ provider: "in-memory", entityName: "RiskAssessment" });
    case "supabase":
      return createRepository<RiskAssessment>({
        provider: "supabase",
        entityName: "RiskAssessment",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_RISK_TABLE ?? "risk_assessments",
        },
      });
    case "firestore":
      return createRepository<RiskAssessment>({
        provider: "firestore",
        entityName: "RiskAssessment",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_RISK_COLLECTION ?? "risk_assessments",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<RiskAssessment>({
        provider: "upstash-redis",
        entityName: "RiskAssessment",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_RISK_PREFIX ?? "risk_assessments",
        },
      });
    case "neon":
      return createRepository<RiskAssessment>({
        provider: "neon",
        entityName: "RiskAssessment",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_RISK_TABLE ?? "risk_assessments",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildSpendRecords(): Repository<SpendRecord> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<SpendRecord>({ provider: "in-memory", entityName: "SpendRecord" });
    case "supabase":
      return createRepository<SpendRecord>({
        provider: "supabase",
        entityName: "SpendRecord",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_SPEND_TABLE ?? "spend_records",
        },
      });
    case "firestore":
      return createRepository<SpendRecord>({
        provider: "firestore",
        entityName: "SpendRecord",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_SPEND_COLLECTION ?? "spend_records",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<SpendRecord>({
        provider: "upstash-redis",
        entityName: "SpendRecord",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_SPEND_PREFIX ?? "spend_records",
        },
      });
    case "neon":
      return createRepository<SpendRecord>({
        provider: "neon",
        entityName: "SpendRecord",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_SPEND_TABLE ?? "spend_records",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const contractRepository: Repository<Contract> = buildContracts();
export const vendorRepository: Repository<Vendor> = buildVendors();
export const renewalRepository: Repository<Renewal> = buildRenewals();
export const riskAssessmentRepository: Repository<RiskAssessment> = buildRiskAssessments();
export const spendRecordRepository: Repository<SpendRecord> = buildSpendRecords();
