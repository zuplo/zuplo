import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

/**
 * Simple handler that returns a static response with a timestamp.
 * The timestamp lets you verify cache behavior - cached responses
 * will have the same timestamp as the original request.
 * 
 * This handler is just for demo purposes. In a real scenario, you would
 * replace this with a URL Rewrite or URL Forward handler that proxies
 * to your actual backend API (e.g., OpenAI, your own LLM service, or
 * any API where caching similar requests would be beneficial).
 * 
 * See: https://zuplo.com/docs/handlers/url-rewrite
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = await request.json();
  
  return new Response(JSON.stringify({
    question: body.question,
    answer: "The capital of France is Paris.",
    // This timestamp is key for the demo - it proves whether
    // the response was freshly generated or served from cache
    generatedAt: new Date().toISOString()
  }), {
    headers: { "content-type": "application/json" }
  });
}