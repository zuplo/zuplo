import { environment, type ZuploContext, type ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Reservation } from "../repositories/reservations.ts";
import type { WaitlistEntry } from "../repositories/waitlist.ts";
import { sendTwilioSms } from "../integrations/twilio.ts";

/**
 * Orchestrator MCP tool: recover_no_show_revenue.
 *
 * Walks reservations marked no_show in a window and matches each
 * against the active waitlist by party size. For each match, when
 * `notify=true` and the waitlist entry has a phone, fires a Twilio
 * SMS inviting the party to come in now. The host still confirms
 * the seating in the floor view.
 */

interface Body {
  windowMinutes?: number;
  from?: string;
  to?: string;
  /** When true, sends a Twilio SMS to each matched waitlist party. Defaults to false. */
  notify?: boolean;
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
  const notify = body.notify ?? false;

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
    smsSid: string | null;
    smsError: string | null;
  }> = [];

  const restaurantName = environment.RESTAURANT_NAME ?? "the restaurant";
  const canSms =
    notify &&
    !!environment.TWILIO_ACCOUNT_SID &&
    !!environment.TWILIO_AUTH_TOKEN &&
    !!environment.TWILIO_FROM_NUMBER;

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

    let smsSid: string | null = null;
    let smsError: string | null = null;
    if (canSms && match.phone) {
      try {
        const result = await sendTwilioSms({
          to: match.phone,
          body: `${restaurantName}: We have a table ready now for your party of ${match.partySize}. Come on in — show this text to the host.`,
        });
        smsSid = result.sid;
      } catch (err) {
        smsError = err instanceof Error ? err.message : String(err);
      }
    }

    matches.push({
      reservation: r,
      waitlistEntry: match,
      minutesPastReservation: Math.round(
        (now.getTime() - reservedMs) / 60_000,
      ),
      waitlistMinutesWaiting: Math.round((now.getTime() - addedMs) / 60_000),
      smsSid,
      smsError,
    });
  }

  return new Response(
    JSON.stringify({
      windowMinutes,
      from,
      to,
      notify: canSms,
      noShowCount: noShows.length,
      waitlistCount: waiting.length,
      matchCount: matches.length,
      matches,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
