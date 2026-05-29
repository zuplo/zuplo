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
 * The Evidence entity — a piece of artifact (screenshot, config, log, policy,
 * attestation) that proves a control is operating effectively.
 */
export interface Evidence extends Entity {
  controlId: string;
  kind: "screenshot" | "config" | "log" | "policy" | "attestation";
  title: string;
  description: string;
  fileUrl: string;
  sha256: string;
  collectedAt: string;
  collectedBy: string;
  validUntil: string | null;
  status: "current" | "stale" | "missing";
  createdAt: string;
}

/**
 * A control — a requirement from a compliance framework (SOC2 CC6.1, etc.).
 */
export interface Control extends Entity {
  slug: string;
  framework: "soc2" | "iso27001" | "hipaa" | "gdpr";
  domain: "access" | "change" | "ops" | "data";
  title: string;
  description: string;
  evidenceFrequencyDays: number;
  owner: string;
  createdAt: string;
}

/**
 * An audit cycle — one engagement against a framework.
 */
export interface AuditCycle extends Entity {
  frameworkSlug: string;
  name: string;
  startsAt: string;
  endsAt: string;
  auditor: string;
  status: "planning" | "in_progress" | "completed";
  createdAt: string;
}

/**
 * A finding raised during an audit cycle.
 */
export interface Finding extends Entity {
  auditCycleId: string;
  controlId: string;
  severity: "low" | "med" | "high" | "critical";
  description: string;
  status: "open" | "remediating" | "resolved" | "accepted_risk";
  closedAt: string | null;
  owner: string;
  createdAt: string;
}

/**
 * A policy document tracked alongside controls.
 */
export interface Policy extends Entity {
  slug: string;
  name: string;
  version: string;
  body: string;
  effectiveDate: string;
  ownerEmail: string;
  createdAt: string;
}

function buildEvidence(): Repository<Evidence> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Evidence>({ provider: "in-memory", entityName: "Evidence" });
    case "supabase":
      return createRepository<Evidence>({
        provider: "supabase",
        entityName: "Evidence",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_EVIDENCE_TABLE ?? "evidence",
        },
      });
    case "firestore":
      return createRepository<Evidence>({
        provider: "firestore",
        entityName: "Evidence",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_EVIDENCE_COLLECTION ?? "evidence",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Evidence>({
        provider: "upstash-redis",
        entityName: "Evidence",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_EVIDENCE_PREFIX ?? "evidence",
        },
      });
    case "neon":
      return createRepository<Evidence>({
        provider: "neon",
        entityName: "Evidence",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_EVIDENCE_TABLE ?? "evidence",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildControls(): Repository<Control> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Control>({ provider: "in-memory", entityName: "Control" });
    case "supabase":
      return createRepository<Control>({
        provider: "supabase",
        entityName: "Control",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_CONTROLS_TABLE ?? "controls",
        },
      });
    case "firestore":
      return createRepository<Control>({
        provider: "firestore",
        entityName: "Control",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_CONTROLS_COLLECTION ?? "controls",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Control>({
        provider: "upstash-redis",
        entityName: "Control",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_CONTROLS_PREFIX ?? "controls",
        },
      });
    case "neon":
      return createRepository<Control>({
        provider: "neon",
        entityName: "Control",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_CONTROLS_TABLE ?? "controls",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildAuditCycles(): Repository<AuditCycle> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<AuditCycle>({ provider: "in-memory", entityName: "AuditCycle" });
    case "supabase":
      return createRepository<AuditCycle>({
        provider: "supabase",
        entityName: "AuditCycle",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_AUDIT_CYCLES_TABLE ?? "audit_cycles",
        },
      });
    case "firestore":
      return createRepository<AuditCycle>({
        provider: "firestore",
        entityName: "AuditCycle",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_AUDIT_CYCLES_COLLECTION ?? "audit_cycles",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<AuditCycle>({
        provider: "upstash-redis",
        entityName: "AuditCycle",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_AUDIT_CYCLES_PREFIX ?? "audit_cycles",
        },
      });
    case "neon":
      return createRepository<AuditCycle>({
        provider: "neon",
        entityName: "AuditCycle",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_AUDIT_CYCLES_TABLE ?? "audit_cycles",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildFindings(): Repository<Finding> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Finding>({ provider: "in-memory", entityName: "Finding" });
    case "supabase":
      return createRepository<Finding>({
        provider: "supabase",
        entityName: "Finding",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_FINDINGS_TABLE ?? "findings",
        },
      });
    case "firestore":
      return createRepository<Finding>({
        provider: "firestore",
        entityName: "Finding",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_FINDINGS_COLLECTION ?? "findings",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Finding>({
        provider: "upstash-redis",
        entityName: "Finding",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_FINDINGS_PREFIX ?? "findings",
        },
      });
    case "neon":
      return createRepository<Finding>({
        provider: "neon",
        entityName: "Finding",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_FINDINGS_TABLE ?? "findings",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildPolicies(): Repository<Policy> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Policy>({ provider: "in-memory", entityName: "Policy" });
    case "supabase":
      return createRepository<Policy>({
        provider: "supabase",
        entityName: "Policy",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_POLICIES_TABLE ?? "policies",
        },
      });
    case "firestore":
      return createRepository<Policy>({
        provider: "firestore",
        entityName: "Policy",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_POLICIES_COLLECTION ?? "policies",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Policy>({
        provider: "upstash-redis",
        entityName: "Policy",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_POLICIES_PREFIX ?? "policies",
        },
      });
    case "neon":
      return createRepository<Policy>({
        provider: "neon",
        entityName: "Policy",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_POLICIES_TABLE ?? "policies",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const evidenceRepository: Repository<Evidence> = buildEvidence();
export const controlRepository: Repository<Control> = buildControls();
export const auditCycleRepository: Repository<AuditCycle> = buildAuditCycles();
export const findingRepository: Repository<Finding> = buildFindings();
export const policyRepository: Repository<Policy> = buildPolicies();
