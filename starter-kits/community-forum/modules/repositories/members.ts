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
 * A Member — a registered community participant identified by email.
 * Tracks lifetime engagement and badge progression. Status is the
 * moderation state (active/suspended/banned).
 */
export interface Member extends Entity {
  email: string;
  displayName: string;
  joinedAt: string;
  postCount: number;
  helpfulCount: number;
  badges: string[];
  status: "active" | "suspended" | "banned";
}

function build(): Repository<Member> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Member>({ provider: "in-memory", entityName: "Member" });
    case "supabase":
      return createRepository<Member>({
        provider: "supabase",
        entityName: "Member",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_MEMBERS_TABLE ?? "members",
        },
      });
    case "firestore":
      return createRepository<Member>({
        provider: "firestore",
        entityName: "Member",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_MEMBERS_COLLECTION ?? "members",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Member>({
        provider: "upstash-redis",
        entityName: "Member",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_MEMBERS_PREFIX ?? "members",
        },
      });
    case "neon":
      return createRepository<Member>({
        provider: "neon",
        entityName: "Member",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_MEMBERS_TABLE ?? "members",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const memberRepository: Repository<Member> = build();
