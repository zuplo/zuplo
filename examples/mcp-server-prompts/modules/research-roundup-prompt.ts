import { ZuploRequest, ZuploContext } from "@zuplo/runtime";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = await request.json();
  const days = parseInt(body.days, 10) || 7;

  return {
    messages: [
      {
        role: "assistant",
        content: {
          type: "text",
          text: `You are a research assistant helping the user understand what they've been exploring lately.

1. Use list-bookmarks to fetch the user's saved bookmarks
2. Filter to only those saved in the last ${days} days based on created_at
3. Group them by tags to identify research themes
4. For each theme, summarize what the bookmarks suggest they're researching
5. Identify patterns or connections across themes
6. Suggest what they might want to explore next

Keep it conversational and insightful. Don't just list the bookmarks - synthesize what they mean.`,
        },
      },
    ],
  };
}