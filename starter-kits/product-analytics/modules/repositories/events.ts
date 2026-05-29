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
 * The Event entity — a single tracked behaviour. The high-volume table.
 * Recommend ClickHouse for production; in-memory works for tests.
 */
export interface Event extends Entity {
  userId: string;
  name: string;
  properties: Record<string, unknown>;
  occurredAt: string;
  sessionId: string | null;
  deviceId: string | null;
  ip: string | null;
  createdAt: string;
}

/**
 * The User entity — anonymous user that may later be identified.
 */
export interface User extends Entity {
  anonId: string;
  identifiedEmail: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  traits: Record<string, unknown>;
  createdAt: string;
}

/**
 * A user session — bounded run of events from one device.
 */
export interface Session extends Entity {
  userId: string;
  startedAt: string;
  endedAt: string | null;
  eventCount: number;
  deviceId: string | null;
  source: string | null;
  createdAt: string;
}

/**
 * A funnel definition — ordered list of step events.
 */
export interface Funnel extends Entity {
  slug: string;
  name: string;
  steps: Array<{ eventName: string; filters: Record<string, unknown> }>;
  createdAt: string;
}

/**
 * A cohort definition — criteria + last-computed user count snapshot.
 */
export interface Cohort extends Entity {
  slug: string;
  name: string;
  criteria: Record<string, unknown>;
  userCount: number;
  computedAt: string | null;
  createdAt: string;
}

function buildEvents(): Repository<Event> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Event>({ provider: "in-memory", entityName: "Event" });
    case "clickhouse":
      return createRepository<Event>({
        provider: "clickhouse",
        entityName: "Event",
        clickhouse: {
          url: requireEnv("CLICKHOUSE_URL"),
          username: requireEnv("CLICKHOUSE_USERNAME"),
          password: requireEnv("CLICKHOUSE_PASSWORD"),
          database: requireEnv("CLICKHOUSE_DATABASE"),
          table: environment.CLICKHOUSE_EVENTS_TABLE ?? "events",
        },
      });
    case "supabase":
      return createRepository<Event>({
        provider: "supabase",
        entityName: "Event",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_EVENTS_TABLE ?? "events",
        },
      });
    case "neon":
      return createRepository<Event>({
        provider: "neon",
        entityName: "Event",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_EVENTS_TABLE ?? "events",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER for Event: ${provider}`);
  }
}

function buildUsers(): Repository<User> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<User>({ provider: "in-memory", entityName: "User" });
    case "clickhouse":
      return createRepository<User>({
        provider: "clickhouse",
        entityName: "User",
        clickhouse: {
          url: requireEnv("CLICKHOUSE_URL"),
          username: requireEnv("CLICKHOUSE_USERNAME"),
          password: requireEnv("CLICKHOUSE_PASSWORD"),
          database: requireEnv("CLICKHOUSE_DATABASE"),
          table: environment.CLICKHOUSE_USERS_TABLE ?? "users",
        },
      });
    case "supabase":
      return createRepository<User>({
        provider: "supabase",
        entityName: "User",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_USERS_TABLE ?? "users",
        },
      });
    case "neon":
      return createRepository<User>({
        provider: "neon",
        entityName: "User",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_USERS_TABLE ?? "users",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER for User: ${provider}`);
  }
}

function buildSessions(): Repository<Session> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Session>({ provider: "in-memory", entityName: "Session" });
    case "clickhouse":
      return createRepository<Session>({
        provider: "clickhouse",
        entityName: "Session",
        clickhouse: {
          url: requireEnv("CLICKHOUSE_URL"),
          username: requireEnv("CLICKHOUSE_USERNAME"),
          password: requireEnv("CLICKHOUSE_PASSWORD"),
          database: requireEnv("CLICKHOUSE_DATABASE"),
          table: environment.CLICKHOUSE_SESSIONS_TABLE ?? "sessions",
        },
      });
    case "supabase":
      return createRepository<Session>({
        provider: "supabase",
        entityName: "Session",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_SESSIONS_TABLE ?? "sessions",
        },
      });
    case "neon":
      return createRepository<Session>({
        provider: "neon",
        entityName: "Session",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_SESSIONS_TABLE ?? "sessions",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER for Session: ${provider}`);
  }
}

function buildFunnels(): Repository<Funnel> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Funnel>({ provider: "in-memory", entityName: "Funnel" });
    case "clickhouse":
      return createRepository<Funnel>({
        provider: "clickhouse",
        entityName: "Funnel",
        clickhouse: {
          url: requireEnv("CLICKHOUSE_URL"),
          username: requireEnv("CLICKHOUSE_USERNAME"),
          password: requireEnv("CLICKHOUSE_PASSWORD"),
          database: requireEnv("CLICKHOUSE_DATABASE"),
          table: environment.CLICKHOUSE_FUNNELS_TABLE ?? "funnels",
        },
      });
    case "supabase":
      return createRepository<Funnel>({
        provider: "supabase",
        entityName: "Funnel",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_FUNNELS_TABLE ?? "funnels",
        },
      });
    case "neon":
      return createRepository<Funnel>({
        provider: "neon",
        entityName: "Funnel",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_FUNNELS_TABLE ?? "funnels",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER for Funnel: ${provider}`);
  }
}

function buildCohorts(): Repository<Cohort> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Cohort>({ provider: "in-memory", entityName: "Cohort" });
    case "clickhouse":
      return createRepository<Cohort>({
        provider: "clickhouse",
        entityName: "Cohort",
        clickhouse: {
          url: requireEnv("CLICKHOUSE_URL"),
          username: requireEnv("CLICKHOUSE_USERNAME"),
          password: requireEnv("CLICKHOUSE_PASSWORD"),
          database: requireEnv("CLICKHOUSE_DATABASE"),
          table: environment.CLICKHOUSE_COHORTS_TABLE ?? "cohorts",
        },
      });
    case "supabase":
      return createRepository<Cohort>({
        provider: "supabase",
        entityName: "Cohort",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_COHORTS_TABLE ?? "cohorts",
        },
      });
    case "neon":
      return createRepository<Cohort>({
        provider: "neon",
        entityName: "Cohort",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_COHORTS_TABLE ?? "cohorts",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER for Cohort: ${provider}`);
  }
}

export const eventRepository: Repository<Event> = buildEvents();
export const userRepository: Repository<User> = buildUsers();
export const sessionRepository: Repository<Session> = buildSessions();
export const funnelRepository: Repository<Funnel> = buildFunnels();
export const cohortRepository: Repository<Cohort> = buildCohorts();
