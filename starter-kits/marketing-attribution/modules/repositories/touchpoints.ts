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
 * The Touchpoint entity. A single visit/interaction recorded for a visitor —
 * the building block of attribution. Primary entity.
 */
export interface Touchpoint extends Entity {
  visitorId: string;
  channel:
    | "paid_search"
    | "organic"
    | "social"
    | "email"
    | "direct"
    | "referral";
  campaignName: string;
  source: string;
  medium: string;
  occurredAt: string;
  url: string;
  sessionId: string;
}

/**
 * The Visitor entity. A first-party visitor identity, optionally identified
 * to an email later in the journey.
 */
export interface Visitor extends Entity {
  anonymousId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  identifiedEmail: string | null;
  attributes: Record<string, unknown>;
}

/**
 * The Conversion entity. A revenue or pipeline event tied to a visitor.
 */
export interface Conversion extends Entity {
  visitorId: string;
  kind: "signup" | "purchase" | "trial" | "demo";
  valueCents: number;
  occurredAt: string;
  dealId: string | null;
}

/**
 * The Channel entity. A marketing channel with optional period spend.
 */
export interface Channel extends Entity {
  slug: string;
  name: string;
  costCents: number;
  costPeriodStart: string;
  costPeriodEnd: string;
}

/**
 * The AttributionModel entity. Defines how credit is split across touchpoints.
 */
export interface AttributionModel extends Entity {
  slug: string;
  name: string;
  weights: Record<string, number>;
  kind: "first" | "last" | "linear" | "position_based" | "time_decay";
}

function buildTouchpoints(): Repository<Touchpoint> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Touchpoint>({ provider: "in-memory", entityName: "Touchpoint" });
    case "supabase":
      return createRepository<Touchpoint>({
        provider: "supabase",
        entityName: "Touchpoint",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_TOUCHPOINTS_TABLE ?? "touchpoints",
        },
      });
    case "firestore":
      return createRepository<Touchpoint>({
        provider: "firestore",
        entityName: "Touchpoint",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_TOUCHPOINTS_COLLECTION ?? "touchpoints",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "clickhouse":
      return createRepository<Touchpoint>({
        provider: "clickhouse",
        entityName: "Touchpoint",
        clickhouse: {
          url: requireEnv("CLICKHOUSE_URL"),
          username: requireEnv("CLICKHOUSE_USERNAME"),
          password: requireEnv("CLICKHOUSE_PASSWORD"),
          database: requireEnv("CLICKHOUSE_DATABASE"),
          table: environment.CLICKHOUSE_TOUCHPOINTS_TABLE ?? "touchpoints",
        },
      });
    case "neon":
      return createRepository<Touchpoint>({
        provider: "neon",
        entityName: "Touchpoint",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_TOUCHPOINTS_TABLE ?? "touchpoints",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildVisitors(): Repository<Visitor> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Visitor>({ provider: "in-memory", entityName: "Visitor" });
    case "supabase":
      return createRepository<Visitor>({
        provider: "supabase",
        entityName: "Visitor",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_VISITORS_TABLE ?? "visitors",
        },
      });
    case "firestore":
      return createRepository<Visitor>({
        provider: "firestore",
        entityName: "Visitor",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_VISITORS_COLLECTION ?? "visitors",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "clickhouse":
      return createRepository<Visitor>({
        provider: "clickhouse",
        entityName: "Visitor",
        clickhouse: {
          url: requireEnv("CLICKHOUSE_URL"),
          username: requireEnv("CLICKHOUSE_USERNAME"),
          password: requireEnv("CLICKHOUSE_PASSWORD"),
          database: requireEnv("CLICKHOUSE_DATABASE"),
          table: environment.CLICKHOUSE_VISITORS_TABLE ?? "visitors",
        },
      });
    case "neon":
      return createRepository<Visitor>({
        provider: "neon",
        entityName: "Visitor",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_VISITORS_TABLE ?? "visitors",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildConversions(): Repository<Conversion> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Conversion>({ provider: "in-memory", entityName: "Conversion" });
    case "supabase":
      return createRepository<Conversion>({
        provider: "supabase",
        entityName: "Conversion",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_CONVERSIONS_TABLE ?? "conversions",
        },
      });
    case "firestore":
      return createRepository<Conversion>({
        provider: "firestore",
        entityName: "Conversion",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_CONVERSIONS_COLLECTION ?? "conversions",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "clickhouse":
      return createRepository<Conversion>({
        provider: "clickhouse",
        entityName: "Conversion",
        clickhouse: {
          url: requireEnv("CLICKHOUSE_URL"),
          username: requireEnv("CLICKHOUSE_USERNAME"),
          password: requireEnv("CLICKHOUSE_PASSWORD"),
          database: requireEnv("CLICKHOUSE_DATABASE"),
          table: environment.CLICKHOUSE_CONVERSIONS_TABLE ?? "conversions",
        },
      });
    case "neon":
      return createRepository<Conversion>({
        provider: "neon",
        entityName: "Conversion",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_CONVERSIONS_TABLE ?? "conversions",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildChannels(): Repository<Channel> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Channel>({ provider: "in-memory", entityName: "Channel" });
    case "supabase":
      return createRepository<Channel>({
        provider: "supabase",
        entityName: "Channel",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_CHANNELS_TABLE ?? "channels",
        },
      });
    case "firestore":
      return createRepository<Channel>({
        provider: "firestore",
        entityName: "Channel",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_CHANNELS_COLLECTION ?? "channels",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "neon":
      return createRepository<Channel>({
        provider: "neon",
        entityName: "Channel",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_CHANNELS_TABLE ?? "channels",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

function buildAttributionModels(): Repository<AttributionModel> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<AttributionModel>({ provider: "in-memory", entityName: "AttributionModel" });
    case "supabase":
      return createRepository<AttributionModel>({
        provider: "supabase",
        entityName: "AttributionModel",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_ATTRIBUTION_MODELS_TABLE ?? "attribution_models",
        },
      });
    case "firestore":
      return createRepository<AttributionModel>({
        provider: "firestore",
        entityName: "AttributionModel",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_ATTRIBUTION_MODELS_COLLECTION ?? "attribution_models",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "neon":
      return createRepository<AttributionModel>({
        provider: "neon",
        entityName: "AttributionModel",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_ATTRIBUTION_MODELS_TABLE ?? "attribution_models",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const touchpointRepository: Repository<Touchpoint> = buildTouchpoints();
export const visitorRepository: Repository<Visitor> = buildVisitors();
export const conversionRepository: Repository<Conversion> = buildConversions();
export const channelRepository: Repository<Channel> = buildChannels();
export const attributionModelRepository: Repository<AttributionModel> = buildAttributionModels();
