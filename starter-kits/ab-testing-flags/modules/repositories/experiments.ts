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
 * The Experiment entity. An A/B test definition with variants and goals.
 * Primary entity.
 */
export interface Experiment extends Entity {
  key: string;
  name: string;
  hypothesis: string;
  status: "draft" | "running" | "paused" | "completed";
  variants: Array<{
    key: string;
    weight: number;
    payload: Record<string, unknown>;
  }>;
  metricGoals: string[];
  startedAt: string | null;
  completedAt: string | null;
  winnerVariantKey: string | null;
  createdAt: string;
}

/**
 * The Flag entity. A boolean/string/json feature flag with optional rollout.
 */
export interface Flag extends Entity {
  key: string;
  name: string;
  kind: "boolean" | "string" | "json";
  value: unknown;
  defaultValue: unknown;
  rollout: Array<{ segmentSlug: string; variantKey: string; percent: number }>;
  active: boolean;
  createdAt: string;
}

/**
 * The Assignment entity. Records which variant a user got for an experiment.
 */
export interface Assignment extends Entity {
  experimentKey: string;
  userId: string;
  variantKey: string;
  assignedAt: string;
}

/**
 * The ConversionEvent entity. A metric event recorded against an experiment.
 */
export interface ConversionEvent extends Entity {
  experimentKey: string;
  userId: string;
  metricKey: string;
  value: number;
  occurredAt: string;
}

/**
 * The ExperimentResult entity. A computed snapshot of variant statistics.
 */
export interface ExperimentResult extends Entity {
  experimentKey: string;
  variantKey: string;
  metricKey: string;
  mean: number;
  stddev: number;
  sampleSize: number;
  pValue: number;
  computedAt: string;
}

function buildExperiments(): Repository<Experiment> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Experiment>({ provider: "in-memory", entityName: "Experiment" });
    case "supabase":
      return createRepository<Experiment>({
        provider: "supabase",
        entityName: "Experiment",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_EXPERIMENTS_TABLE ?? "experiments",
        },
      });
    case "firestore":
      return createRepository<Experiment>({
        provider: "firestore",
        entityName: "Experiment",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_EXPERIMENTS_COLLECTION ?? "experiments",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "neon":
      return createRepository<Experiment>({
        provider: "neon",
        entityName: "Experiment",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_EXPERIMENTS_TABLE ?? "experiments",
        },
      });
    case "upstash-redis":
      return createRepository<Experiment>({
        provider: "upstash-redis",
        entityName: "Experiment",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_EXPERIMENTS_PREFIX ?? "experiments",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildFlags(): Repository<Flag> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Flag>({ provider: "in-memory", entityName: "Flag" });
    case "supabase":
      return createRepository<Flag>({
        provider: "supabase",
        entityName: "Flag",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_FLAGS_TABLE ?? "flags",
        },
      });
    case "firestore":
      return createRepository<Flag>({
        provider: "firestore",
        entityName: "Flag",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_FLAGS_COLLECTION ?? "flags",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "neon":
      return createRepository<Flag>({
        provider: "neon",
        entityName: "Flag",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_FLAGS_TABLE ?? "flags",
        },
      });
    case "upstash-redis":
      return createRepository<Flag>({
        provider: "upstash-redis",
        entityName: "Flag",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_FLAGS_PREFIX ?? "flags",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildAssignments(): Repository<Assignment> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Assignment>({ provider: "in-memory", entityName: "Assignment" });
    case "supabase":
      return createRepository<Assignment>({
        provider: "supabase",
        entityName: "Assignment",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_ASSIGNMENTS_TABLE ?? "assignments",
        },
      });
    case "firestore":
      return createRepository<Assignment>({
        provider: "firestore",
        entityName: "Assignment",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_ASSIGNMENTS_COLLECTION ?? "assignments",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "neon":
      return createRepository<Assignment>({
        provider: "neon",
        entityName: "Assignment",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_ASSIGNMENTS_TABLE ?? "assignments",
        },
      });
    case "upstash-redis":
      return createRepository<Assignment>({
        provider: "upstash-redis",
        entityName: "Assignment",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_ASSIGNMENTS_PREFIX ?? "assignments",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildEvents(): Repository<ConversionEvent> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<ConversionEvent>({ provider: "in-memory", entityName: "ConversionEvent" });
    case "supabase":
      return createRepository<ConversionEvent>({
        provider: "supabase",
        entityName: "ConversionEvent",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_EVENTS_TABLE ?? "conversion_events",
        },
      });
    case "firestore":
      return createRepository<ConversionEvent>({
        provider: "firestore",
        entityName: "ConversionEvent",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_EVENTS_COLLECTION ?? "conversion_events",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "neon":
      return createRepository<ConversionEvent>({
        provider: "neon",
        entityName: "ConversionEvent",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_EVENTS_TABLE ?? "conversion_events",
        },
      });
    case "upstash-redis":
      return createRepository<ConversionEvent>({
        provider: "upstash-redis",
        entityName: "ConversionEvent",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_EVENTS_PREFIX ?? "conversion_events",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildResults(): Repository<ExperimentResult> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<ExperimentResult>({ provider: "in-memory", entityName: "ExperimentResult" });
    case "supabase":
      return createRepository<ExperimentResult>({
        provider: "supabase",
        entityName: "ExperimentResult",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_RESULTS_TABLE ?? "experiment_results",
        },
      });
    case "firestore":
      return createRepository<ExperimentResult>({
        provider: "firestore",
        entityName: "ExperimentResult",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_RESULTS_COLLECTION ?? "experiment_results",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "neon":
      return createRepository<ExperimentResult>({
        provider: "neon",
        entityName: "ExperimentResult",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_RESULTS_TABLE ?? "experiment_results",
        },
      });
    case "upstash-redis":
      return createRepository<ExperimentResult>({
        provider: "upstash-redis",
        entityName: "ExperimentResult",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_RESULTS_PREFIX ?? "experiment_results",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const experimentRepository: Repository<Experiment> = buildExperiments();
export const flagRepository: Repository<Flag> = buildFlags();
export const assignmentRepository: Repository<Assignment> = buildAssignments();
export const eventRepository: Repository<ConversionEvent> = buildEvents();
export const resultRepository: Repository<ExperimentResult> = buildResults();
