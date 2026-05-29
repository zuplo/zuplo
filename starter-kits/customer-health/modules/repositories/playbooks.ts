import { environment } from "@zuplo/runtime";
import {
  createRepository,
  type DbProvider,
  type Entity,
  type Repository,
} from "@zuplo/starter-kit-shared/adapters";

function requireEnv(name: string): string {
  const value = (environment as Record<string, string | undefined>)[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

/**
 * A reusable response sequence triggered by a signal. Steps are intentionally
 * free-form strings — production forks usually extend this with structured
 * actions (send_email, schedule_call, etc.).
 */
export interface Playbook extends Entity {
  name: string;
  trigger: { signalKind: string; minSeverity: "low" | "med" | "high" };
  steps: string[];
}

function build(): Repository<Playbook> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<Playbook>({
        provider: "in-memory",
        entityName: "Playbook",
      });
    case "supabase":
      return createRepository<Playbook>({
        provider: "supabase",
        entityName: "Playbook",
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: environment.SUPABASE_PLAYBOOKS_TABLE ?? "playbooks",
        },
      });
    case "firestore":
      return createRepository<Playbook>({
        provider: "firestore",
        entityName: "Playbook",
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: environment.FIRESTORE_PLAYBOOKS_COLLECTION ?? "playbooks",
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<Playbook>({
        provider: "upstash-redis",
        entityName: "Playbook",
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: environment.UPSTASH_PLAYBOOKS_PREFIX ?? "playbooks",
        },
      });
    case "neon":
      return createRepository<Playbook>({
        provider: "neon",
        entityName: "Playbook",
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: environment.NEON_PLAYBOOKS_TABLE ?? "playbooks",
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const playbookRepository: Repository<Playbook> = build();
