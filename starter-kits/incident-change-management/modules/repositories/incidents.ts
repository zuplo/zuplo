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
 * A production incident.
 */
export interface Incident extends Entity {
  title: string;
  description: string;
  severity: "sev1" | "sev2" | "sev3" | "sev4";
  status: "investigating" | "identified" | "monitoring" | "resolved";
  commanderEmail: string;
  declaredAt: string;
  resolvedAt: string | null;
  affectedServices: string[];
  rootCause: string | null;
}

/**
 * A status update posted to an incident.
 */
export interface IncidentUpdate extends Entity {
  incidentId: string;
  body: string;
  postedBy: string;
  postedAt: string;
  audience: "internal" | "customer";
}

/**
 * A planned change.
 */
export interface Change extends Entity {
  title: string;
  description: string;
  kind: "standard" | "normal" | "emergency";
  riskLevel: "low" | "med" | "high";
  scheduledFor: string;
  status: "draft" | "submitted" | "approved" | "rejected" | "completed" | "failed" | "rolled_back";
  changeOwner: string;
  approverEmail: string | null;
  affectedServices: string[];
  completedAt: string | null;
}

/**
 * A postmortem document linked to an incident.
 */
export interface Postmortem extends Entity {
  incidentId: string;
  content: string;
  status: "draft" | "reviewed" | "published";
  actionItems: string[];
}

/**
 * An on-call rotation entry.
 */
export interface OnCall extends Entity {
  rotationName: string;
  employeeEmail: string;
  startsAt: string;
  endsAt: string;
}

function buildIncidents(): Repository<Incident> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Incident>({ provider: "in-memory", entityName: "Incident" });
    case "supabase":
      return createRepository<Incident>({
        provider: "supabase",
        entityName: "Incident",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_INCIDENTS_TABLE ?? "incidents",
        },
      });
    case "firestore":
      return createRepository<Incident>({
        provider: "firestore",
        entityName: "Incident",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_INCIDENTS_COLLECTION ?? "incidents",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Incident>({
        provider: "upstash-redis",
        entityName: "Incident",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_INCIDENTS_PREFIX ?? "incidents",
        },
      });
    case "neon":
      return createRepository<Incident>({
        provider: "neon",
        entityName: "Incident",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_INCIDENTS_TABLE ?? "incidents",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildIncidentUpdates(): Repository<IncidentUpdate> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<IncidentUpdate>({ provider: "in-memory", entityName: "IncidentUpdate" });
    case "supabase":
      return createRepository<IncidentUpdate>({
        provider: "supabase",
        entityName: "IncidentUpdate",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_UPDATES_TABLE ?? "incident_updates",
        },
      });
    case "firestore":
      return createRepository<IncidentUpdate>({
        provider: "firestore",
        entityName: "IncidentUpdate",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_UPDATES_COLLECTION ?? "incident_updates",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<IncidentUpdate>({
        provider: "upstash-redis",
        entityName: "IncidentUpdate",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_UPDATES_PREFIX ?? "incident_updates",
        },
      });
    case "neon":
      return createRepository<IncidentUpdate>({
        provider: "neon",
        entityName: "IncidentUpdate",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_UPDATES_TABLE ?? "incident_updates",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildChanges(): Repository<Change> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Change>({ provider: "in-memory", entityName: "Change" });
    case "supabase":
      return createRepository<Change>({
        provider: "supabase",
        entityName: "Change",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_CHANGES_TABLE ?? "changes",
        },
      });
    case "firestore":
      return createRepository<Change>({
        provider: "firestore",
        entityName: "Change",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_CHANGES_COLLECTION ?? "changes",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Change>({
        provider: "upstash-redis",
        entityName: "Change",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_CHANGES_PREFIX ?? "changes",
        },
      });
    case "neon":
      return createRepository<Change>({
        provider: "neon",
        entityName: "Change",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_CHANGES_TABLE ?? "changes",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildPostmortems(): Repository<Postmortem> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Postmortem>({ provider: "in-memory", entityName: "Postmortem" });
    case "supabase":
      return createRepository<Postmortem>({
        provider: "supabase",
        entityName: "Postmortem",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_POSTMORTEMS_TABLE ?? "postmortems",
        },
      });
    case "firestore":
      return createRepository<Postmortem>({
        provider: "firestore",
        entityName: "Postmortem",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_POSTMORTEMS_COLLECTION ?? "postmortems",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Postmortem>({
        provider: "upstash-redis",
        entityName: "Postmortem",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_POSTMORTEMS_PREFIX ?? "postmortems",
        },
      });
    case "neon":
      return createRepository<Postmortem>({
        provider: "neon",
        entityName: "Postmortem",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_POSTMORTEMS_TABLE ?? "postmortems",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildOnCall(): Repository<OnCall> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<OnCall>({ provider: "in-memory", entityName: "OnCall" });
    case "supabase":
      return createRepository<OnCall>({
        provider: "supabase",
        entityName: "OnCall",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_ONCALL_TABLE ?? "oncall",
        },
      });
    case "firestore":
      return createRepository<OnCall>({
        provider: "firestore",
        entityName: "OnCall",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_ONCALL_COLLECTION ?? "oncall",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<OnCall>({
        provider: "upstash-redis",
        entityName: "OnCall",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_ONCALL_PREFIX ?? "oncall",
        },
      });
    case "neon":
      return createRepository<OnCall>({
        provider: "neon",
        entityName: "OnCall",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_ONCALL_TABLE ?? "oncall",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const incidentRepository: Repository<Incident> = buildIncidents();
export const incidentUpdateRepository: Repository<IncidentUpdate> = buildIncidentUpdates();
export const changeRepository: Repository<Change> = buildChanges();
export const postmortemRepository: Repository<Postmortem> = buildPostmortems();
export const onCallRepository: Repository<OnCall> = buildOnCall();
