import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";

/**
 * Orchestrator: define_funnel_from_question.
 *
 * Stub matcher: looks for word overlap between a natural-language question
 * and a list of candidate event names supplied by the caller. Returns a
 * proposed funnel of ordered steps. The caller can then call `create_funnel`
 * to persist it.
 */

interface Body {
  question: string;
  candidateEvents: string[];
}

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9_\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function eventTokens(name: string): string[] {
  // Split snake_case / camelCase event names into discrete tokens.
  return name
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean);
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.question || !Array.isArray(body.candidateEvents)) {
    return new Response(
      JSON.stringify({
        error: {
          type: "bad_request",
          message: "question and candidateEvents[] are required",
        },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const questionTokens = new Set(tokens(body.question));

  const ranked = body.candidateEvents
    .map((name) => {
      const overlapped = eventTokens(name).filter((t) => questionTokens.has(t));
      return {
        eventName: name,
        score: overlapped.length,
        matchedTokens: overlapped,
      };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  // Order proposed steps by where they appear in `candidateEvents` (caller's
  // intended ordering) once they cross the threshold.
  const candidateIndex = new Map(body.candidateEvents.map((n, i) => [n, i]));
  const selected = ranked.slice(0, Math.min(6, ranked.length));
  selected.sort((a, b) => (candidateIndex.get(a.eventName) ?? 0) - (candidateIndex.get(b.eventName) ?? 0));

  const proposedSteps = selected.map((s) => ({
    eventName: s.eventName,
    filters: {} as Record<string, unknown>,
    matchedTokens: s.matchedTokens,
  }));

  return new Response(
    JSON.stringify({
      question: body.question,
      proposedSteps,
      candidatesConsidered: body.candidateEvents.length,
      questionTokens: Array.from(questionTokens),
    }),
    { headers: { "content-type": "application/json" } },
  );
}
