import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import { requireTenant } from "../_shared/auth/index.ts";
import type { Reservation } from "../repositories/reservations.ts";
import { guestRepository } from "../repositories/guests.ts";
import { guestNoteRepository } from "../repositories/guest-notes.ts";

/**
 * Orchestrator MCP tool: recognize_vip_guest.
 *
 * Given a reservation, hydrates the guest profile + recent reservation history
 * + recent staff notes, and returns a host briefing the maître d' can read at
 * the door. The LLM grounds on this to greet the guest correctly and flag
 * allergies/preferences to the kitchen.
 *
 * Reservations are read through the public route (so tenant scoping +
 * filters by guestId are enforced). Guest profile and notes are read directly
 * from the repository because they have no public list-by-guest route in this
 * kit.
 */

interface Body {
  reservationId: string;
}

interface ReservationPage {
  items: Reservation[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  if (!body.reservationId) {
    return new Response(
      JSON.stringify({
        error: { type: "bad_request", message: "reservationId is required" },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const auth = { authorization: request.headers.get("authorization") ?? "" };

  // Pull the reservation through the public endpoint so it inherits auth.
  const reservation = await invokeJson<Reservation>(
    context,
    `/reservations/${encodeURIComponent(body.reservationId)}`,
    { headers: auth },
  ).catch(() => null);

  if (!reservation) {
    return new Response(
      JSON.stringify({
        error: { type: "not_found", message: "Reservation not found" },
      }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  const guest = await guestRepository.get(tenantId, reservation.guestId);

  // History — every other reservation by this guest.
  const historyItems: Reservation[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({
      limit: "200",
      guestId: reservation.guestId,
    });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<ReservationPage>(
      context,
      `/reservations?${qs}`,
      { headers: auth },
    );
    historyItems.push(...page.items);
    cursor = page.nextCursor;
    if (historyItems.length > 500) break;
  } while (cursor);

  const completedHistory = historyItems
    .filter((r) => r.status === "completed" && r.id !== reservation.id)
    .sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor));

  // Recent staff notes.
  const allNotes = await guestNoteRepository.list(tenantId, { limit: 200 });
  const guestNotes = allNotes.items
    .filter((n) => n.guestId === reservation.guestId)
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
    .slice(0, 5);

  const isVip = guest?.vip === true;
  const recentVisitCount = completedHistory.length;
  const briefingLines: string[] = [];
  if (guest) {
    briefingLines.push(
      `${guest.firstName} ${guest.lastName} — ${recentVisitCount} prior visit${recentVisitCount === 1 ? "" : "s"}.`,
    );
    if (isVip) briefingLines.push("VIP — flag the manager when seated.");
    if (guest.allergies.length > 0) {
      briefingLines.push(`Allergies: ${guest.allergies.join(", ")}.`);
    }
    if (guest.preferences) {
      briefingLines.push(`Preferences: ${guest.preferences}`);
    }
    if (reservation.specialRequests) {
      briefingLines.push(`This visit: ${reservation.specialRequests}`);
    }
  }

  return new Response(
    JSON.stringify({
      reservation,
      guest,
      isVip,
      recentVisitCount,
      lastVisitAt: completedHistory[0]?.scheduledFor ?? null,
      recentNotes: guestNotes,
      briefing: briefingLines.join("\n"),
    }),
    { headers: { "content-type": "application/json" } },
  );
}
