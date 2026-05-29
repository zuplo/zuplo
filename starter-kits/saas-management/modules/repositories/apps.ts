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
 * A SaaS application the company subscribes to.
 */
export interface SaaSApp extends Entity {
  slug: string;
  name: string;
  vendor: string;
  category: string;
  owner: string;
  totalSeats: number;
  activeSeats: number;
  annualCostCents: number;
  renewalDate: string;
  status: "active" | "under_review" | "churning";
}

/**
 * A user-level license assignment to a SaaS app.
 */
export interface License extends Entity {
  saasAppSlug: string;
  employeeEmail: string;
  role: string;
  assignedAt: string;
  removedAt: string | null;
  lastActiveAt: string | null;
}

/**
 * A seat (capacity unit) on a SaaS app.
 */
export interface Seat extends Entity {
  saasAppSlug: string;
  kind: "user" | "admin";
  costCents: number;
  status: "assigned" | "unassigned";
}

/**
 * A usage window for an employee on a SaaS app.
 */
export interface Usage extends Entity {
  saasAppSlug: string;
  employeeEmail: string;
  periodStart: string;
  periodEnd: string;
  sessionCount: number;
  lastSessionAt: string;
}

/**
 * An upcoming renewal action for a SaaS app.
 */
export interface Renewal extends Entity {
  saasAppSlug: string;
  dueDate: string;
  plannedAction: "renew_same" | "reduce_seats" | "upgrade" | "replace" | "churn";
  currentSeats: number;
  plannedSeats: number;
}

function buildApps(): Repository<SaaSApp> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<SaaSApp>({ provider: "in-memory", entityName: "SaaSApp" });
    case "supabase":
      return createRepository<SaaSApp>({
        provider: "supabase",
        entityName: "SaaSApp",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_APPS_TABLE ?? "saas_apps",
        },
      });
    case "firestore":
      return createRepository<SaaSApp>({
        provider: "firestore",
        entityName: "SaaSApp",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_APPS_COLLECTION ?? "saas_apps",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<SaaSApp>({
        provider: "upstash-redis",
        entityName: "SaaSApp",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_APPS_PREFIX ?? "saas_apps",
        },
      });
    case "neon":
      return createRepository<SaaSApp>({
        provider: "neon",
        entityName: "SaaSApp",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_APPS_TABLE ?? "saas_apps",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildLicenses(): Repository<License> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<License>({ provider: "in-memory", entityName: "License" });
    case "supabase":
      return createRepository<License>({
        provider: "supabase",
        entityName: "License",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_LICENSES_TABLE ?? "licenses",
        },
      });
    case "firestore":
      return createRepository<License>({
        provider: "firestore",
        entityName: "License",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_LICENSES_COLLECTION ?? "licenses",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<License>({
        provider: "upstash-redis",
        entityName: "License",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_LICENSES_PREFIX ?? "licenses",
        },
      });
    case "neon":
      return createRepository<License>({
        provider: "neon",
        entityName: "License",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_LICENSES_TABLE ?? "licenses",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildSeats(): Repository<Seat> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Seat>({ provider: "in-memory", entityName: "Seat" });
    case "supabase":
      return createRepository<Seat>({
        provider: "supabase",
        entityName: "Seat",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_SEATS_TABLE ?? "seats",
        },
      });
    case "firestore":
      return createRepository<Seat>({
        provider: "firestore",
        entityName: "Seat",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_SEATS_COLLECTION ?? "seats",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Seat>({
        provider: "upstash-redis",
        entityName: "Seat",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_SEATS_PREFIX ?? "seats",
        },
      });
    case "neon":
      return createRepository<Seat>({
        provider: "neon",
        entityName: "Seat",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_SEATS_TABLE ?? "seats",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildUsage(): Repository<Usage> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Usage>({ provider: "in-memory", entityName: "Usage" });
    case "supabase":
      return createRepository<Usage>({
        provider: "supabase",
        entityName: "Usage",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_USAGE_TABLE ?? "usage",
        },
      });
    case "firestore":
      return createRepository<Usage>({
        provider: "firestore",
        entityName: "Usage",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_USAGE_COLLECTION ?? "usage",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Usage>({
        provider: "upstash-redis",
        entityName: "Usage",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_USAGE_PREFIX ?? "usage",
        },
      });
    case "neon":
      return createRepository<Usage>({
        provider: "neon",
        entityName: "Usage",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_USAGE_TABLE ?? "usage",
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
          table: environment.SUPABASE_RENEWALS_TABLE ?? "saas_renewals",
        },
      });
    case "firestore":
      return createRepository<Renewal>({
        provider: "firestore",
        entityName: "Renewal",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_RENEWALS_COLLECTION ?? "saas_renewals",
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
          keyPrefix: environment.UPSTASH_RENEWALS_PREFIX ?? "saas_renewals",
        },
      });
    case "neon":
      return createRepository<Renewal>({
        provider: "neon",
        entityName: "Renewal",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_RENEWALS_TABLE ?? "saas_renewals",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const saasAppRepository: Repository<SaaSApp> = buildApps();
export const licenseRepository: Repository<License> = buildLicenses();
export const seatRepository: Repository<Seat> = buildSeats();
export const usageRepository: Repository<Usage> = buildUsage();
export const renewalRepository: Repository<Renewal> = buildRenewals();
