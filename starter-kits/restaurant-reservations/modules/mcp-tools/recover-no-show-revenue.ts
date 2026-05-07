import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Reservation } from "../repositories/reservations.ts";
import type { WaitlistEntry } from "../repositories/waitlist.ts";

/**
 * Orchestrator MCP tool: recover_no_show_revenue.
 *
 * Walks reservations marked no_show in a window and matches each against
 * the active waitlist by party size. Returns suggested seatings — turning
 * lost covers into recovered revenue. The LLM presents the matches to the
 * host, who confirms and the seating is logged.
 */

interface Body {
  windowMinutes?: number;
  from?: string;
  to?: string;
}

interface ReservationPage {
  items: Reservation[];
  nextCursor: string | null;
}
interface WaitlistPage {
  items: WaitlistEntry[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const windowMinutes = Math.max(5, Math.min(240, body.windowMinutes ?? 30));
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const now = new Date();
  const from = body.from ?? new Date(now.getTime() - 24 * 3600_000).toISOString();
  const to = body.to ?? now.toISOString();

  // No-shows in the window.
  const noShows: Reservation[] = [];
  let rCursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({
      limit: "200",
      from,
      to,
      status: "no_show",
    });
    if (rCursor) qs.set("cursor", rCursor);
    const page = await invokeJson<ReservationPage>(
      context,
      `/reservations?${qs}`,
      { headers: auth },
    );
    noShows.push(...page.items);
    rCursor = page.nextCursor;
    if (noShows.length > 1000) break;
  } while (rCursor);

  // Active waitlist.
  const waiting: WaitlistEntry[] = [];
  let wCursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200", status: "waiting" });
    if (wCursor) qs.set("cursor", wCursor);
    const page = await invokeJson<WaitlistPage>(context, `/waitlist?${qs}`, {
      headers: auth,
    });
    waiting.push(...page.items);
    wCursor = page.nextCursor;
    if (waiting.length > 1000) break;
  } while (wCursor);

  // Match each no-show to the longest-waiting party of the same size,
  // preferring smaller parties to avoid over-seating a 4-top.
  const remainingWaitlist = [...waiting].sort((a, b) =>
    a.addedAt.localeCompare(b.addedAt),
  );
  const matches: Array<{
    reservation: Reservation;
    waitlistEntry: WaitlistEntry;
    minutesPastReservation: number;
    waitlistMinutesWaiting: number;
  }> = [];

  for (const r of noShows) {
    const reservedMs = Date.parse(r.scheduledFor);
    const cutoff = reservedMs + windowMinutes * 60_000;
    if (cutoff < now.getTime()) continue;

    const idx = remainingWaitlist.findIndex(
      (w) => w.partySize <= r.partySize && w.partySize >= Math.max(1, r.partySize - 1),
    );
    if (idx < 0) continue;
    const [match] = remainingWaitlist.splice(idx, 1);
    if (!match) continue;
    const addedMs = Date.parse(match.addedAt);
    matches.push({
      reservation: r,
      waitlistEntry: match,
      minutesPastReservation: Math.round(
        (now.getTime() - reservedMs) / 60_000,
      ),
      waitlistMinutesWaiting: Math.round((now.getTime() - addedMs) / 60_000),
    });
  }

  return new Response(
    JSON.stringify({
      windowMinutes,
      from,
      to,
      noShowCount: noShows.length,
      waitlistCount: waiting.length,
      matchCount: matches.length,
      matches,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
