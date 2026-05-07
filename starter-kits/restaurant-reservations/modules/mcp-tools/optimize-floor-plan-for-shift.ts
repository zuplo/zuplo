import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Reservation } from "../repositories/reservations.ts";
import type { Table } from "../repositories/tables.ts";
import type { Shift } from "../repositories/shifts.ts";

/**
 * Orchestrator MCP tool: optimize_floor_plan_for_shift.
 *
 * Greedy table-assignment for a shift. Walks every confirmed reservation in
 * scheduledFor order, finds the smallest table that fits the party and is
 * free at that time (plus a turnaround buffer), and reports the assignments
 * + any unassignable parties so the host can adjust.
 *
 * Reservations and tables are read through public list endpoints so tenant
 * scoping + rate limits are inherited; the shift is read directly via
 * list_shifts since there's no per-id route.
 */

interface Body {
  shiftId: string;
  bufferMinutes?: number;
}

interface ReservationPage {
  items: Reservation[];
  nextCursor: string | null;
}
interface TablePage {
  items: Table[];
  nextCursor: string | null;
}
interface ShiftPage {
  items: Shift[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  if (!body.shiftId) {
    return new Response(
      JSON.stringify({
        error: { type: "bad_request", message: "shiftId is required" },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const buffer = Math.max(0, Math.min(120, body.bufferMinutes ?? 15));
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  // Find the shift.
  const shifts: Shift[] = [];
  let sCursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (sCursor) qs.set("cursor", sCursor);
    const page = await invokeJson<ShiftPage>(context, `/shifts?${qs}`, {
      headers: auth,
    });
    shifts.push(...page.items);
    sCursor = page.nextCursor;
    if (shifts.length > 1000) break;
  } while (sCursor);
  const shift = shifts.find((s) => s.id === body.shiftId);
  if (!shift) {
    return new Response(
      JSON.stringify({
        error: { type: "not_found", message: "Shift not found" },
      }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  // Reservations during the shift window.
  const reservations: Reservation[] = [];
  let rCursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({
      limit: "200",
      from: shift.startsAt,
      to: shift.endsAt,
      status: "confirmed",
    });
    if (rCursor) qs.set("cursor", rCursor);
    const page = await invokeJson<ReservationPage>(
      context,
      `/reservations?${qs}`,
      { headers: auth },
    );
    reservations.push(...page.items);
    rCursor = page.nextCursor;
    if (reservations.length > 5000) break;
  } while (rCursor);

  // Available tables.
  const tables: Table[] = [];
  let tCursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (tCursor) qs.set("cursor", tCursor);
    const page = await invokeJson<TablePage>(context, `/tables?${qs}`, {
      headers: auth,
    });
    tables.push(...page.items);
    tCursor = page.nextCursor;
    if (tables.length > 1000) break;
  } while (tCursor);

  const usable = tables
    .filter((t) => t.status !== "out_of_service")
    .sort((a, b) => a.capacity - b.capacity);

  // Track booked windows per table.
  const tableBookings = new Map<string, { startMs: number; endMs: number }[]>();
  type Assignment = {
    reservationId: string;
    guestId: string;
    partySize: number;
    scheduledFor: string;
    tableId: string;
    tableNumber: string;
    capacity: number;
  };
  const assignments: Assignment[] = [];
  const unassigned: Reservation[] = [];

  // Stable order: earliest scheduledFor first; ties broken by larger party.
  const sorted = [...reservations].sort((a, b) =>
    a.scheduledFor === b.scheduledFor
      ? b.partySize - a.partySize
      : a.scheduledFor.localeCompare(b.scheduledFor),
  );

  for (const r of sorted) {
    const startMs = Date.parse(r.scheduledFor);
    const endMs = startMs + (r.durationMinutes + buffer) * 60_000;
    const candidate = usable.find((t) => {
      if (t.capacity < r.partySize) return false;
      const taken = tableBookings.get(t.id) ?? [];
      return !taken.some((b) => b.startMs < endMs && startMs < b.endMs);
    });
    if (!candidate) {
      unassigned.push(r);
      continue;
    }
    const list = tableBookings.get(candidate.id) ?? [];
    list.push({ startMs, endMs });
    tableBookings.set(candidate.id, list);
    assignments.push({
      reservationId: r.id,
      guestId: r.guestId,
      partySize: r.partySize,
      scheduledFor: r.scheduledFor,
      tableId: candidate.id,
      tableNumber: candidate.number,
      capacity: candidate.capacity,
    });
  }

  return new Response(
    JSON.stringify({
      shiftId: shift.id,
      bufferMinutes: buffer,
      reservationCount: reservations.length,
      tableCount: usable.length,
      assignedCount: assignments.length,
      unassignedCount: unassigned.length,
      assignments,
      unassigned: unassigned.map((r) => ({
        reservationId: r.id,
        guestId: r.guestId,
        partySize: r.partySize,
        scheduledFor: r.scheduledFor,
      })),
    }),
    { headers: { "content-type": "application/json" } },
  );
}
