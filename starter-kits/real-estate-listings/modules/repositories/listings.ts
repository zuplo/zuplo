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
 * The Listing entity. The primary record for a property on the market.
 */
export interface Listing extends Entity {
  mlsNumber: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  listPriceCents: number;
  status: "coming_soon" | "active" | "under_contract" | "sold" | "withdrawn";
  bedrooms: number;
  bathrooms: number;
  squareFeet: number;
  lotSizeSqft: number;
  propertyType: "single_family" | "condo" | "townhouse" | "multi_family";
  listingAgentEmail: string;
  listedAt: string;
  soldAt: string | null;
  soldPriceCents: number | null;
  description: string;
  createdAt: string;
}

/**
 * A Lead is a prospective buyer — pre-qualified or not. Stage of pipeline
 * tracked via `status`.
 */
export interface Lead extends Entity {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  source: string;
  status: "new" | "contacted" | "qualified" | "under_contract" | "closed" | "lost";
  agentEmail: string;
  budgetCents: number | null;
  areaInterest: string;
  bedroomsMin: number | null;
  addedAt: string;
  createdAt: string;
}

/**
 * A Showing is an in-person tour of a Listing scheduled for a Lead.
 */
export interface Showing extends Entity {
  listingId: string;
  leadId: string;
  scheduledFor: string;
  durationMinutes: number;
  agentEmail: string;
  status: "scheduled" | "completed" | "canceled" | "no_show";
  feedback: string;
  createdAt: string;
}

/**
 * An Offer made by a Lead on a Listing.
 */
export interface Offer extends Entity {
  listingId: string;
  leadId: string;
  amountCents: number;
  contingencies: string[];
  status: "submitted" | "countered" | "accepted" | "rejected" | "withdrawn";
  submittedAt: string;
  createdAt: string;
}

/**
 * A document attached to a listing — disclosures, inspections, contracts.
 */
export interface ListingDocument extends Entity {
  listingId: string;
  kind: "disclosure" | "inspection" | "contract" | "photos";
  title: string;
  fileUrl: string;
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

export const listingRepository: Repository<Listing> = buildRepo<Listing>("Listing", "listings");
export const leadRepository: Repository<Lead> = buildRepo<Lead>("Lead", "leads");
export const showingRepository: Repository<Showing> = buildRepo<Showing>("Showing", "showings");
export const offerRepository: Repository<Offer> = buildRepo<Offer>("Offer", "offers");
export const listingDocumentRepository: Repository<ListingDocument> = buildRepo<ListingDocument>(
  "ListingDocument",
  "listing_documents",
);
