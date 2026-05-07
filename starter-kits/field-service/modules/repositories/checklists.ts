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

export interface ChecklistItem {
  label: string;
  completed: boolean;
  completedAt?: string | null;
}

/**
 * The Checklist entity. The completed checklist for a job.
 */
export interface Checklist extends Entity {
  jobId: string;
  items: ChecklistItem[];
}

function build(): Repository<Checklist> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;

  switch (provider) {
    case "in-memory":
      return createRepository<Checklist>({
        provider: "in-memory",
        entityName: "Checklist",
      });
    case "supabase":
      return createRepository<Checklist>({
        provider: "supabase",
        entityName: "Checklist",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_CHECKLISTS_TABLE ?? "checklists",
        },
      });
    case "firestore":
      return createRepository<Checklist>({
        provider: "firestore",
        entityName: "Checklist",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection:
            environment.FIRESTORE_CHECKLISTS_COLLECTION ?? "checklists",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Checklist>({
        provider: "upstash-redis",
        entityName: "Checklist",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_CHECKLISTS_KEY_PREFIX ?? "checklists",
        },
      });
    case "neon":
      return createRepository<Checklist>({
        provider: "neon",
        entityName: "Checklist",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_CHECKLISTS_TABLE ?? "checklists",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const checklistRepository: Repository<Checklist> = build();
