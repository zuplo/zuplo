import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Survey } from "../repositories/surveys.ts";

/**
 * Orchestrator MCP tool: propose_followup_question.
 *
 * Given a list of theme keywords (e.g. from `cluster_open_responses`),
 * suggests a follow-up question prompt the LLM caller can rewrite. The
 * heuristic is deliberately simple — themes go in, prompt comes out.
 */

interface Body {
  surveyId: string;
  themeKeywords: string[];
  kind?: "single_choice" | "multi_choice" | "text" | "rating" | "nps";
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  const auth = { authorization: request.headers.get("authorization") ?? "" };
  const themes = body.themeKeywords.map((t) => t.trim()).filter(Boolean).slice(0, 8);

  const survey = await invokeJson<Survey>(context, `/surveys/${body.surveyId}`, {
    headers: auth,
  });

  const kind = body.kind ?? "text";
  const themeList = themes.length === 0 ? "your earlier feedback" : themes.join(", ");
  let prompt: string;
  let suggestedOptions: string[] = [];
  switch (kind) {
    case "rating":
      prompt = `On a 1-5 scale, how strongly do these areas (${themeList}) affect your experience with ${survey.title}?`;
      break;
    case "nps":
      prompt = `On a 0-10 scale, how likely are you to recommend ${survey.title}, given your feedback on ${themeList}?`;
      break;
    case "single_choice":
      prompt = `Which of the following best describes the area you'd most like us to improve, related to ${themeList}?`;
      suggestedOptions = themes.length > 0 ? themes : ["Performance", "Reliability", "Other"];
      break;
    case "multi_choice":
      prompt = `Which of the following themes apply to your experience? (Select all that apply)`;
      suggestedOptions = themes.length > 0 ? themes : ["Performance", "Reliability", "Other"];
      break;
    case "text":
    default:
      prompt = `You mentioned ${themeList}. Could you tell us more about the specific situations where this comes up?`;
      break;
  }

  return new Response(
    JSON.stringify({
      surveyId: body.surveyId,
      surveyTitle: survey.title,
      themes,
      proposedQuestion: {
        prompt,
        kind,
        options: suggestedOptions,
      },
      note: "Heuristic suggestion — caller is expected to rewrite for tone.",
    }),
    { headers: { "content-type": "application/json" } },
  );
}
