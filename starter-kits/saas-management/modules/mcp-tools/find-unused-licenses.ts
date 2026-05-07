import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { License } from "../repositories/apps.ts";

/**
 * Orchestrator: find_unused_licenses.
 *
 * Returns currently-active licenses (removedAt is null) whose lastActiveAt
 * is older than `daysWithoutActivity` days, or never active. Reclaim these
 * to reduce wasted spend.
 */

interface Body {
  daysWithoutActivity?: number;
}

interface LicensePage {
  items: License[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const daysWithoutActivity = Math.max(1, Math.min(365, body.daysWithoutActivity ?? 30));
  const auth = request.headers.get("authorization") ?? "";
  const cutoffMs = Date.now() - daysWithoutActivity * 86400000;

  const stale: Array<License & { daysSinceActivity: number | null }> = [];
  let cursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<LicensePage>(context, `/licenses?${qs}`, {
      headers: { authorization: auth },
    });
    for (const license of page.items) {
      if (license.removedAt) continue;
      let daysSinceActivity: number | null = null;
      let staleEnough = false;
      if (license.lastActiveAt) {
        const lastMs = Date.parse(license.lastActiveAt);
        if (!Number.isNaN(lastMs)) {
          daysSinceActivity = Math.round((Date.now() - lastMs) / 86400000);
          staleEnough = lastMs < cutoffMs;
        }
      } else {
        // Never active - check assignedAt
        const assignedMs = Date.parse(license.assignedAt);
        if (!Number.isNaN(assignedMs) && assignedMs < cutoffMs) {
          staleEnough = true;
          daysSinceActivity = Math.round((Date.now() - assignedMs) / 86400000);
        }
      }
      if (staleEnough) {
        stale.push({ ...license, daysSinceActivity });
      }
    }
    cursor = page.nextCursor;
    if (stale.length > 1000) break;
  } while (cursor);

  stale.sort((a, b) => (b.daysSinceActivity ?? 0) - (a.daysSinceActivity ?? 0));

  return new Response(
    JSON.stringify({
      daysWithoutActivity,
      count: stale.length,
      licenses: stale,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
