import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { saasAppRepository, type SaaSApp } from "../repositories/apps.ts";
import {
  listOAuthAuthorizedApps,
  listWorkspaceUsers,
} from "../integrations/google-workspace.ts";
import {
  listConsentedThirdPartyApps,
  listSubscribedSkus,
} from "../integrations/microsoft-365.ts";
import {
  listOktaAppsWithUserCounts,
  listOktaUsers,
} from "../integrations/okta.ts";

/**
 * Orchestrator MCP tool: discover_apps.
 *
 * Scrapes the configured identity providers (Google Workspace, Microsoft 365,
 * Okta) for SaaS apps the company actually has accounts in, plus their seat
 * counts, and upserts the result into the apps catalog.
 *
 * This is the kit's "you point it at your IdP and stop guessing" moment. The
 * kit auto-scopes by `tenantId` from the API key, but each integration has
 * one set of credentials — multi-tenant deployments need per-tenant secrets,
 * which you can route via Zuplo per-tenant env vars in production.
 */

interface Body {
  /** Subset of providers to query. Defaults to all configured. */
  providers?: Array<"google-workspace" | "microsoft-365" | "okta">;
  /** When true, persist results to the catalog. Defaults true. */
  upsert?: boolean;
}

interface DiscoveredApp {
  source: "google-workspace" | "microsoft-365" | "okta";
  slug: string;
  name: string;
  vendor: string;
  totalSeats: number;
  activeSeats: number;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "unknown";
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json().catch(() => ({}))) as Body;
  const providers = body.providers ?? ["google-workspace", "microsoft-365", "okta"];
  const shouldUpsert = body.upsert !== false;

  const discovered: DiscoveredApp[] = [];
  const errors: Array<{ provider: string; message: string }> = [];

  if (providers.includes("google-workspace")) {
    try {
      const [users, oauthApps] = await Promise.all([
        listWorkspaceUsers().catch(() => []),
        listOAuthAuthorizedApps(30),
      ]);
      // Workspace itself: total seats == active users.
      if (users.length > 0) {
        discovered.push({
          source: "google-workspace",
          slug: "google-workspace",
          name: "Google Workspace",
          vendor: "Google",
          totalSeats: users.length,
          activeSeats: users.filter((u) => !u.suspended).length,
        });
      }
      for (const app of oauthApps) {
        discovered.push({
          source: "google-workspace",
          slug: slugify(app.displayText),
          name: app.displayText,
          vendor: app.displayText.split(" ")[0] || "Unknown",
          totalSeats: app.userCount,
          activeSeats: app.userCount,
        });
      }
    } catch (err) {
      errors.push({ provider: "google-workspace", message: (err as Error).message });
    }
  }

  if (providers.includes("microsoft-365")) {
    try {
      const [skus, apps] = await Promise.all([
        listSubscribedSkus(),
        listConsentedThirdPartyApps().catch(() => []),
      ]);
      for (const sku of skus) {
        discovered.push({
          source: "microsoft-365",
          slug: slugify(sku.skuPartNumber),
          name: `Microsoft 365 — ${sku.skuPartNumber}`,
          vendor: "Microsoft",
          totalSeats: sku.totalSeats,
          activeSeats: sku.consumedUnits,
        });
      }
      for (const app of apps) {
        discovered.push({
          source: "microsoft-365",
          slug: slugify(app.displayName),
          name: app.displayName,
          vendor: app.publisherName ?? "Unknown",
          totalSeats: 0,
          activeSeats: 0,
        });
      }
    } catch (err) {
      errors.push({ provider: "microsoft-365", message: (err as Error).message });
    }
  }

  if (providers.includes("okta")) {
    try {
      const [users, apps] = await Promise.all([
        listOktaUsers().catch(() => []),
        listOktaAppsWithUserCounts(),
      ]);
      // Okta itself.
      if (users.length > 0) {
        discovered.push({
          source: "okta",
          slug: "okta",
          name: "Okta",
          vendor: "Okta",
          totalSeats: users.length,
          activeSeats: users.length,
        });
      }
      for (const app of apps) {
        discovered.push({
          source: "okta",
          slug: slugify(app.label || app.name),
          name: app.label || app.name,
          vendor: app.name.split("_")[0] || "Unknown",
          totalSeats: app.assignedUserCount,
          activeSeats: app.assignedUserCount,
        });
      }
    } catch (err) {
      errors.push({ provider: "okta", message: (err as Error).message });
    }
  }

  // Merge by slug so duplicates across IdPs collapse — pick the highest seat
  // count seen.
  const merged = new Map<string, DiscoveredApp>();
  for (const d of discovered) {
    const existing = merged.get(d.slug);
    if (!existing || d.totalSeats > existing.totalSeats) {
      merged.set(d.slug, d);
    }
  }

  const results: Array<{ app: DiscoveredApp; persisted: SaaSApp | null }> = [];
  if (shouldUpsert) {
    // Pull existing apps once.
    const existingPage = await saasAppRepository.list(tenantId, { limit: 200 });
    const existingBySlug = new Map(existingPage.items.map((a) => [a.slug, a]));

    for (const d of merged.values()) {
      const existing = existingBySlug.get(d.slug);
      if (existing) {
        const updated = await saasAppRepository.update(tenantId, existing.id, {
          totalSeats: d.totalSeats,
          activeSeats: d.activeSeats,
        });
        results.push({ app: d, persisted: updated });
      } else {
        const created = await saasAppRepository.create(tenantId, {
          slug: d.slug,
          name: d.name,
          vendor: d.vendor,
          category: "discovered",
          owner: "",
          totalSeats: d.totalSeats,
          activeSeats: d.activeSeats,
          annualCostCents: 0,
          renewalDate: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
          status: "under_review",
        });
        results.push({ app: d, persisted: created });
      }
    }
  } else {
    for (const d of merged.values()) results.push({ app: d, persisted: null });
  }

  return new Response(
    JSON.stringify({
      providers,
      discovered: merged.size,
      apps: results,
      errors,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
