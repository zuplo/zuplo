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
 * The Matter entity. The primary unit of legal work for a client — a
 * litigation, a transaction, an advisory engagement, etc.
 */
export interface Matter extends Entity {
  title: string;
  clientId: string;
  kind: "litigation" | "transactional" | "advisory" | "compliance" | "ip";
  status: "open" | "in_progress" | "on_hold" | "closed";
  openedAt: string;
  closedAt: string | null;
  leadAttorneyEmail: string;
  billingType: "hourly" | "flat" | "contingency";
  description: string;
  createdAt: string;
}

/**
 * A Client of the firm — an individual or organization that retains the firm
 * for one or more Matters. Used for conflict checking.
 */
export interface Client extends Entity {
  name: string;
  kind: "individual" | "organization";
  email: string;
  phone: string;
  billingAddress: string;
  conflicts: string[];
  createdAt: string;
}

/**
 * A document associated with a matter — pleadings, contracts, discovery, etc.
 * `privileged` flags work-product / attorney-client privileged docs.
 */
export interface MatterDocument extends Entity {
  matterId: string;
  kind: "pleading" | "contract" | "correspondence" | "discovery" | "other";
  title: string;
  fileUrl: string;
  uploadedAt: string;
  uploadedBy: string;
  privileged: boolean;
  createdAt: string;
}

/**
 * A Deadline tied to a matter. Court deadlines must not be missed; client and
 * internal deadlines are softer.
 */
export interface Deadline extends Entity {
  matterId: string;
  title: string;
  dueDate: string;
  kind: "court" | "client" | "internal";
  status: "upcoming" | "completed" | "missed";
  createdAt: string;
}

/**
 * A logged time entry for billing. `billable` distinguishes client work from
 * pro bono / internal time.
 */
export interface MatterTimeEntry extends Entity {
  matterId: string;
  attorneyEmail: string;
  durationMinutes: number;
  narrative: string;
  billable: boolean;
  performedAt: string;
  createdAt: string;
}

/**
 * A Conflict check record for a candidate intake.
 */
export interface Conflict extends Entity {
  matterId: string;
  candidateClientName: string;
  status: "checked_clear" | "flagged" | "waived";
  createdAt: string;
}

function buildRepo<T extends Entity>(entityName: string, slug: string): Repository<T> {
  const provider = (environment.DB_PROVIDER ?? "in-memory") as DbProvider;
  switch (provider) {
    case "in-memory":
      return createRepository<T>({ provider: "in-memory", entityName });
    case "supabase":
      return createRepository<T>({
        provider: "supabase",
        entityName,
        supabase: {
          url: requireEnv("SUPABASE_URL"),
          serviceKey: requireEnv("SUPABASE_SERVICE_KEY"),
          table: (environment as Record<string, string | undefined>)[`SUPABASE_${slug.toUpperCase()}_TABLE`] ?? slug,
        },
      });
    case "firestore":
      return createRepository<T>({
        provider: "firestore",
        entityName,
        firestore: {
          projectId: requireEnv("FIREBASE_PROJECT"),
          collection: (environment as Record<string, string | undefined>)[`FIRESTORE_${slug.toUpperCase()}_COLLECTION`] ?? slug,
          getAccessToken: async () => requireEnv("FIREBASE_ACCESS_TOKEN"),
        },
      });
    case "upstash-redis":
      return createRepository<T>({
        provider: "upstash-redis",
        entityName,
        upstashRedis: {
          url: requireEnv("UPSTASH_REDIS_REST_URL"),
          token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
          keyPrefix: (environment as Record<string, string | undefined>)[`UPSTASH_${slug.toUpperCase()}_PREFIX`] ?? slug,
        },
      });
    case "neon":
      return createRepository<T>({
        provider: "neon",
        entityName,
        neon: {
          url: requireEnv("NEON_HTTP_URL"),
          connectionString: requireEnv("NEON_CONNECTION_STRING"),
          table: (environment as Record<string, string | undefined>)[`NEON_${slug.toUpperCase()}_TABLE`] ?? slug,
        },
      });
    default:
      throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
  }
}

export const matterRepository: Repository<Matter> = buildRepo<Matter>("Matter", "matters");
export const clientRepository: Repository<Client> = buildRepo<Client>("Client", "clients");
export const matterDocumentRepository: Repository<MatterDocument> = buildRepo<MatterDocument>(
  "MatterDocument",
  "matter_documents",
);
export const deadlineRepository: Repository<Deadline> = buildRepo<Deadline>("Deadline", "deadlines");
export const matterTimeEntryRepository: Repository<MatterTimeEntry> = buildRepo<MatterTimeEntry>(
  "MatterTimeEntry",
  "matter_time_entries",
);
export const conflictRepository: Repository<Conflict> = buildRepo<Conflict>("Conflict", "conflicts");
