import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";

/**
 * Orchestrator MCP tool: draft_changelog_from_merged_prs.
 *
 * Given a list of merged PR titles (typically from a CI step that calls this
 * after a release), groups them into changelog buckets and returns a proposed
 * announcement body. The agent can then call create_announcement / publish_*
 * to actually post — this tool stays read-only and returns a draft.
 */

interface Body {
  prTitles: string[];
  releaseTag?: string;
}

function classify(title: string): "feature" | "fix" | "chore" {
  const t = title.toLowerCase();
  if (t.startsWith("fix:") || t.startsWith("fix(") || t.includes(" fix ") || t.startsWith("bugfix")) {
    return "fix";
  }
  if (t.startsWith("feat:") || t.startsWith("feat(") || t.startsWith("feature")) {
    return "feature";
  }
  if (t.startsWith("chore:") || t.startsWith("docs:") || t.startsWith("refactor")) {
    return "chore";
  }
  return "feature";
}

function stripPrefix(title: string): string {
  return title
    .replace(/^(feat|fix|chore|docs|refactor)(\([^)]+\))?:\s*/i, "")
    .trim();
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.prTitles || !Array.isArray(body.prTitles) || body.prTitles.length === 0) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "prTitles must be a non-empty array" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const buckets: Record<"feature" | "fix" | "chore", string[]> = {
    feature: [],
    fix: [],
    chore: [],
  };

  for (const title of body.prTitles) {
    const kind = classify(title);
    buckets[kind].push(stripPrefix(title));
  }

  const lines: string[] = [];
  if (body.releaseTag) {
    lines.push(`# ${body.releaseTag}`);
    lines.push("");
  }
  if (buckets.feature.length > 0) {
    lines.push("## New");
    for (const t of buckets.feature) lines.push(`- ${t}`);
    lines.push("");
  }
  if (buckets.fix.length > 0) {
    lines.push("## Fixes");
    for (const t of buckets.fix) lines.push(`- ${t}`);
    lines.push("");
  }
  if (buckets.chore.length > 0) {
    lines.push("## Other");
    for (const t of buckets.chore) lines.push(`- ${t}`);
  }

  const draftBody = lines.join("\n").trim();
  const draftTitle = body.releaseTag
    ? `Changelog ${body.releaseTag}`
    : `Changelog ${new Date().toISOString().slice(0, 10)}`;

  return new Response(
    JSON.stringify({
      draftTitle,
      draftBody,
      counts: {
        feature: buckets.feature.length,
        fix: buckets.fix.length,
        chore: buckets.chore.length,
      },
    }),
    { headers: { "content-type": "application/json" } },
  );
}
