import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Application } from "../repositories/applications.ts";
import { candidateRepository } from "../repositories/candidates.ts";
import { scorecardRepository } from "../repositories/scorecards.ts";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { completeWithClaude } from "../integrations/claude.ts";

/**
 * Orchestrator MCP tool: summarize_candidate.
 *
 * Pulls the candidate record + every Application + every Scorecard, and
 * (when generateBrief: true) asks Claude to fold the resume + scorecards into
 * a tight interview prep brief. Returns both the raw timeline and the brief
 * so the caller can show evidence behind the summary.
 */

interface Body {
  candidateId: string;
  /** When true, ask Claude for a 4-paragraph hiring brief. */
  generateBrief?: boolean;
  /** Optional candidate resume text — included in the brief when supplied. */
  resumeText?: string;
  /** Brief tone: "neutral" (default), "advocate" (champion the candidate), "skeptical" (probe weaknesses). */
  briefTone?: "neutral" | "advocate" | "skeptical";
}

interface ApplicationPage {
  items: Application[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  if (!body.candidateId) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "candidateId is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const auth = request.headers.get("authorization") ?? "";

  const candidate = await candidateRepository.get(tenantId, body.candidateId);

  // Pull all applications for this candidate.
  const applications: Application[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200", candidateId: body.candidateId });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<ApplicationPage>(
      context,
      `/applications?${qs}`,
      { headers: { authorization: auth } },
    );
    applications.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);

  // Pull all scorecards across those applications. Scorecards has no public
  // list endpoint in this kit so we read directly from the repository.
  const allScorecards = await scorecardRepository.list(tenantId, { limit: 200 });
  const appIds = new Set(applications.map((a) => a.id));
  const scorecards = allScorecards.items.filter((s) => appIds.has(s.applicationId));

  const timeline = applications
    .map((a) => ({
      applicationId: a.id,
      jobId: a.jobId,
      stage: a.stage,
      stageEnteredAt: a.stageEnteredAt,
      createdAt: a.createdAt,
      source: a.source,
      score: a.score,
      scorecards: scorecards
        .filter((s) => s.applicationId === a.id)
        .map((s) => ({
          interviewerEmail: s.interviewerEmail,
          recommendation: s.recommendation,
          ratings: s.ratings,
          notes: s.notes,
        })),
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // Optional Claude-drafted hiring brief.
  let brief:
    | { text: string; model: string; inputTokens: number; outputTokens: number; tone: string }
    | undefined;
  if (body.generateBrief) {
    const tone = body.briefTone ?? "neutral";
    try {
      const candidateBlock = candidate
        ? `Name: ${candidate.firstName} ${candidate.lastName}\nEmail: ${candidate.email}\nCurrent title: ${candidate.currentTitle ?? "(none)"}\nLinkedIn: ${candidate.linkedinUrl ?? "(none)"}`
        : "Candidate record not found";

      const scorecardBlock = scorecards
        .map(
          (s) =>
            `- ${s.interviewerEmail} → ${s.recommendation}\n  ratings: ${JSON.stringify(s.ratings)}\n  notes: ${s.notes.slice(0, 800)}`,
        )
        .join("\n");

      const applicationBlock = timeline
        .map((a) => `- application=${a.applicationId} job=${a.jobId} stage=${a.stage} (since ${a.stageEnteredAt})`)
        .join("\n");

      const completion = await completeWithClaude({
        system:
          "You are a senior recruiter writing a hiring brief for an interview panel. Write 4 short paragraphs:\n1. Who they are (background, current role).\n2. Pipeline activity across roles.\n3. What the scorecards say (consensus, dissent, themes — be specific).\n4. Recommended next step.\n\n" +
          `Tone: ${tone === "advocate" ? "Champion the candidate but cite evidence." : tone === "skeptical" ? "Probe risks and gaps without dismissing strengths." : "Calibrated, factual, no hedging."}\n\n` +
          "Use only the data provided. Never invent dates or quotes.",
        messages: [
          {
            role: "user",
            content:
              `Candidate:\n${candidateBlock}\n\n` +
              `Resume excerpt:\n${body.resumeText ? body.resumeText.slice(0, 4000) : "(not provided)"}\n\n` +
              `Applications:\n${applicationBlock || "(none)"}\n\n` +
              `Scorecards (${scorecards.length}):\n${scorecardBlock || "(none)"}\n\n` +
              `Write the brief.`,
          },
        ],
        temperature: 0.3,
        maxTokens: 1200,
      });
      brief = {
        text: completion.text,
        model: completion.model,
        inputTokens: completion.inputTokens,
        outputTokens: completion.outputTokens,
        tone,
      };
    } catch (err) {
      brief = {
        text: `(Claude brief unavailable: ${(err as Error).message})`,
        model: "",
        inputTokens: 0,
        outputTokens: 0,
        tone,
      };
    }
  }

  return new Response(
    JSON.stringify({
      candidate,
      applicationCount: applications.length,
      scorecardCount: scorecards.length,
      timeline,
      brief,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
