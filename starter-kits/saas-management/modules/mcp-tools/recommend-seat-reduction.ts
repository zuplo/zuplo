import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { SaaSApp, License } from "../repositories/apps.ts";

/**
 * Orchestrator: recommend_seat_reduction.
 *
 * For a SaaS app, count active license assignments (removedAt is null) vs.
 * total seats and recommend a new seat count + estimated annual savings.
 */

interface Body {
  saasAppSlug: string;
}

interface AppPage {
  items: SaaSApp[];
  nextCursor: string | null;
}

interface LicensePage {
  items: License[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.saasAppSlug) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "saasAppSlug is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const auth = request.headers.get("authorization") ?? "";

  // Find the app by slug.
  let app: SaaSApp | null = null;
  let appCursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (appCursor) qs.set("cursor", appCursor);
    const page = await invokeJson<AppPage>(context, `/apps?${qs}`, {
      headers: { authorization: auth },
    });
    const match = page.items.find((a) => a.slug === body.saasAppSlug);
    if (match) {
      app = match;
      break;
    }
    appCursor = page.nextCursor;
  } while (appCursor);

  if (!app) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "App not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  // Count active license assignments.
  let activeLicenses = 0;
  let licenseCursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({
      limit: "200",
      saasAppSlug: body.saasAppSlug,
    });
    if (licenseCursor) qs.set("cursor", licenseCursor);
    const page = await invokeJson<LicensePage>(context, `/licenses?${qs}`, {
      headers: { authorization: auth },
    });
    for (const license of page.items) {
      if (!license.removedAt) activeLicenses += 1;
    }
    licenseCursor = page.nextCursor;
  } while (licenseCursor);

  // Recommend keeping headroom of 10%.
  const recommendedSeats = Math.max(1, Math.ceil(activeLicenses * 1.1));
  const seatsToRemove = Math.max(0, app.totalSeats - recommendedSeats);
  const annualSavingsCents =
    app.totalSeats > 0
      ? Math.round((app.annualCostCents / app.totalSeats) * seatsToRemove)
      : 0;

  return new Response(
    JSON.stringify({
      saasAppSlug: body.saasAppSlug,
      currentTotalSeats: app.totalSeats,
      activeLicenses,
      recommendedSeats,
      seatsToRemove,
      annualSavingsCents,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
