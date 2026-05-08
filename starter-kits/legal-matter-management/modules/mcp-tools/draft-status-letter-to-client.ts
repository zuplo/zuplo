import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type {
  Client,
  Deadline,
  Matter,
  MatterDocument,
  MatterTimeEntry,
} from "../repositories/matters.ts";
import { sendResendEmail } from "../integrations/resend.ts";

/**
 * Orchestrator MCP tool: draft_status_letter_to_client.
 *
 * Builds a structured draft letter body summarizing recent activity on a
 * matter — non-privileged docs, deadlines, billable summary. When `send=true`,
 * actually emails the client via Resend (default = draft only).
 */

interface Body {
  matterId: string;
  /** When true, send via Resend after drafting. */
  send?: boolean;
  /** Optional override of recipient. Defaults to the client.email on file. */
  toEmail?: string;
  /** Optional cc list. */
  cc?: string[];
  /** Override subject. */
  subject?: string;
}

interface DeadlinePage { items: Deadline[]; nextCursor: string | null; }
interface DocPage { items: MatterDocument[]; nextCursor: string | null; }
interface TimePage { items: MatterTimeEntry[]; nextCursor: string | null; }

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.matterId) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "matterId is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const matter = await invokeJson<Matter>(context, `/matters/${encodeURIComponent(body.matterId)}`, {
    headers: auth,
  });
  const client = await invokeJson<Client>(context, `/clients/${encodeURIComponent(matter.clientId)}`, {
    headers: auth,
  });

  const deadlines: Deadline[] = [];
  let dCursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (dCursor) qs.set("cursor", dCursor);
    const page = await invokeJson<DeadlinePage>(context, `/deadlines?${qs}`, { headers: auth });
    deadlines.push(...page.items);
    dCursor = page.nextCursor;
    if (deadlines.length > 5000) break;
  } while (dCursor);

  const docs: MatterDocument[] = [];
  let docCursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (docCursor) qs.set("cursor", docCursor);
    const page = await invokeJson<DocPage>(context, `/documents?${qs}`, { headers: auth });
    docs.push(...page.items);
    docCursor = page.nextCursor;
    if (docs.length > 5000) break;
  } while (docCursor);

  const times: MatterTimeEntry[] = [];
  let tCursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (tCursor) qs.set("cursor", tCursor);
    const page = await invokeJson<TimePage>(context, `/time-entries?${qs}`, { headers: auth });
    times.push(...page.items);
    tCursor = page.nextCursor;
    if (times.length > 5000) break;
  } while (tCursor);

  const recentDocs = docs
    .filter((d) => d.matterId === body.matterId && !d.privileged)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
    .slice(0, 5);
  const upcoming = deadlines
    .filter((d) => d.matterId === body.matterId && d.status === "upcoming")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5);
  const periodTimes = times.filter((t) => t.matterId === body.matterId);
  const totalBillableHours =
    periodTimes.reduce((sum, t) => sum + (t.billable ? t.durationMinutes : 0), 0) / 60;

  const lines: string[] = [];
  lines.push(`Dear ${client.name},`);
  lines.push("");
  lines.push(
    `This letter provides an update on the status of your matter, "${matter.title}" (opened ${matter.openedAt.slice(0, 10)}, kind: ${matter.kind}).`,
  );
  lines.push("");
  if (recentDocs.length > 0) {
    lines.push("Recent activity:");
    for (const d of recentDocs) {
      lines.push(`- ${d.uploadedAt.slice(0, 10)} — ${d.title} (${d.kind})`);
    }
    lines.push("");
  }
  if (upcoming.length > 0) {
    lines.push("Upcoming deadlines:");
    for (const d of upcoming) {
      lines.push(`- ${d.dueDate} — ${d.title} (${d.kind})`);
    }
    lines.push("");
  }
  lines.push(`We have logged approximately ${totalBillableHours.toFixed(1)} billable hours on this matter to date.`);
  lines.push("");
  lines.push("Please reach out with any questions.");
  lines.push("");
  lines.push("Sincerely,");
  lines.push(matter.leadAttorneyEmail);

  const draftLetter = lines.join("\n");
  const subject = body.subject ?? `Status update — ${matter.title}`;

  let sentMessageId: string | null = null;
  let sendError: string | null = null;
  if (body.send) {
    try {
      const html = `<div style="font-family:Georgia,serif;max-width:640px;line-height:1.5">${draftLetter
        .split("\n")
        .map((l) => `<p style="margin:0 0 0.6em">${escapeHtml(l) || "&nbsp;"}</p>`)
        .join("")}</div>`;
      const resp = await sendResendEmail({
        to: body.toEmail ?? client.email,
        cc: body.cc,
        subject,
        html,
        text: draftLetter,
        replyTo: matter.leadAttorneyEmail,
        idempotencyKey: `status-letter-${matter.id}-${new Date().toISOString().slice(0, 10)}`,
      });
      sentMessageId = resp.id;
    } catch (err) {
      sendError = (err as Error).message;
    }
  }

  return new Response(
    JSON.stringify({
      matterId: body.matterId,
      clientName: client.name,
      subject,
      draftLetter,
      includedDocumentCount: recentDocs.length,
      upcomingDeadlineCount: upcoming.length,
      sent: Boolean(sentMessageId),
      sentMessageId,
      sendError,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
