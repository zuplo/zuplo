import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { TimeEntry } from "../repositories/time-entries.ts";
import { completeWithClaude } from "../integrations/claude.ts";
import { sendResendEmail } from "../integrations/resend.ts";

/**
 * Orchestrator MCP tool: chase_unbilled_hours.
 *
 * Walks every employee's draft, billable time entries, and for each employee
 * with > minimum-hours unbilled, asks Claude to draft a friendly nudge email
 * and (when sendEmails: true) sends it via Resend. Useful as a Friday-morning
 * "submit your timesheets" sweep — without anyone manually writing the same
 * email twenty times.
 *
 * Inputs include an optional `employeeEmails` map so the orchestrator can
 * actually send to humans; without it, the tool returns drafted emails for
 * an agent to review and dispatch through some other means.
 */

interface Body {
  /** Hours-unbilled threshold per employee. Skip employees below this. Defaults to 1. */
  minHours?: number;
  /** Limit the scan to a single project. */
  projectId?: string;
  /** Map of employeeId -> email address. Required when sendEmails=true. */
  employeeEmails?: Record<string, string>;
  /** Optional friendly first names for the email greeting. */
  employeeNames?: Record<string, string>;
  /** When true, send the drafted email via Resend. Default: false (returns drafts only). */
  sendEmails?: boolean;
  /** Optional company / sender name used in the email body. */
  fromName?: string;
}

interface TimeEntryPage {
  items: TimeEntry[];
  nextCursor: string | null;
}

interface DraftedNudge {
  employeeId: string;
  email: string | null;
  unbilledHours: number;
  unbilledEntries: number;
  byProject: Array<{ projectId: string; hours: number }>;
  draft: { subject: string; text: string; model: string } | null;
  send: { sent: boolean; id?: string; error?: string } | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const auth = request.headers.get("authorization") ?? "";
  const minHours = Math.max(0, body.minHours ?? 1);
  const fromName = body.fromName ?? "Operations";

  // Pull every draft, billable entry (optionally for a single project).
  const entries: TimeEntry[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({
      limit: "200",
      status: "draft",
      billable: "true",
    });
    if (body.projectId) qs.set("projectId", body.projectId);
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<TimeEntryPage>(
      context,
      `/time-entries?${qs}`,
      { headers: { authorization: auth } },
    );
    entries.push(...page.items);
    cursor = page.nextCursor;
    if (entries.length > 5000) break;
  } while (cursor);

  // Group by employee.
  const byEmployee = new Map<
    string,
    { totalMinutes: number; entryCount: number; byProject: Map<string, number> }
  >();
  for (const e of entries) {
    if (e.timesheetId) continue;
    const emp = byEmployee.get(e.employeeId) ?? {
      totalMinutes: 0,
      entryCount: 0,
      byProject: new Map<string, number>(),
    };
    emp.totalMinutes += e.durationMinutes;
    emp.entryCount += 1;
    emp.byProject.set(e.projectId, (emp.byProject.get(e.projectId) ?? 0) + e.durationMinutes);
    byEmployee.set(e.employeeId, emp);
  }

  const drafts: DraftedNudge[] = [];

  for (const [employeeId, info] of byEmployee.entries()) {
    const unbilledHours = Math.round((info.totalMinutes / 60) * 100) / 100;
    if (unbilledHours < minHours) continue;
    const email = body.employeeEmails?.[employeeId] ?? null;
    const name = body.employeeNames?.[employeeId] ?? employeeId;

    const byProject = Array.from(info.byProject.entries())
      .map(([projectId, mins]) => ({
        projectId,
        hours: Math.round((mins / 60) * 100) / 100,
      }))
      .sort((a, b) => b.hours - a.hours);

    // Draft the email with Claude.
    let draft: DraftedNudge["draft"] = null;
    try {
      const projectLines = byProject
        .map((p) => `- ${p.projectId}: ${p.hours} hrs`)
        .join("\n");
      const completion = await completeWithClaude({
        system:
          "You are a friendly operations coordinator at a small services company. Write a short nudge email (3-4 sentences max) reminding a colleague to submit their timesheet for the week. Tone: warm, casual, never accusatory. Always include the totals you're given. End with a one-line sign-off using the from name. Do NOT add a subject line — just the body. Plain text only, no HTML, no markdown.",
        messages: [
          {
            role: "user",
            content:
              `Recipient first name: ${name}\n` +
              `Total unbilled hours: ${unbilledHours}\n` +
              `Entry count: ${info.entryCount}\n` +
              `Breakdown by project:\n${projectLines}\n\n` +
              `From: ${fromName}\n\n` +
              `Write the email body.`,
          },
        ],
        temperature: 0.4,
        maxTokens: 400,
      });
      draft = {
        subject: `Quick reminder: ${unbilledHours} hours waiting to be submitted`,
        text: completion.text,
        model: completion.model,
      };
    } catch (err) {
      draft = {
        subject: `Quick reminder: ${unbilledHours} hours waiting to be submitted`,
        text:
          `Hi ${name},\n\n` +
          `You have ${unbilledHours} hours of billable time across ${info.entryCount} draft entries that haven't been submitted yet. Could you submit them when you get a sec? Thanks!\n\n` +
          `— ${fromName}\n\n` +
          `(Auto-fallback: Claude draft unavailable: ${(err as Error).message})`,
        model: "fallback",
      };
    }

    // Send via Resend if asked and we have an address.
    let send: DraftedNudge["send"] = null;
    if (body.sendEmails && email && draft) {
      try {
        const result = await sendResendEmail({
          to: email,
          subject: draft.subject,
          text: draft.text,
        });
        send = { sent: true, id: result.id };
      } catch (err) {
        send = { sent: false, error: (err as Error).message };
      }
    } else if (body.sendEmails && !email) {
      send = { sent: false, error: "No email address for this employee in employeeEmails." };
    }

    drafts.push({
      employeeId,
      email,
      unbilledHours,
      unbilledEntries: info.entryCount,
      byProject,
      draft,
      send,
    });
  }

  drafts.sort((a, b) => b.unbilledHours - a.unbilledHours);

  return new Response(
    JSON.stringify({
      filter: { projectId: body.projectId ?? null, minHours },
      employeeCount: drafts.length,
      drafts,
      sendsAttempted: body.sendEmails === true,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
