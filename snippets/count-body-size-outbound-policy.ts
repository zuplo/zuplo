import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

/**
 * This policy counts the size of the outbound response body
 * while streaming the response to the user. Using this method is
 * preferred to reading the entire body in memory and sending it as
 * that will introduce latency and other potential performance issues.
 *
 * NOTE: Custom outbound policies only run when `response.ok === true`.
 * Responses with a 4xx or 5xx status never reach this code, so the size
 * of an error response body is never counted. Do not use this policy as
 * the basis for billing, quota, or any other metric that must account
 * for every response.
 *
 * The count is completed after the response has been returned, so it is
 * registered with `context.waitUntil` to keep the runtime alive until the
 * stream has been fully drained. Without it the isolate can be torn down
 * as soon as the response flushes and the measurement is silently lost.
 */
export default async function policy(
  response: Response,
  request: ZuploRequest,
  context: ZuploContext,
  options: unknown,
  policyName: string
): Promise<Response> {
  if (!response.body) {
    // No body to stream
    return response;
  }

  // Tee the response body: create two identical readable streams
  const [stream1, stream2] = response.body.tee();

  // Size counter - runs in the background, but is registered with
  // waitUntil so the runtime does not tear down before it finishes.
  context.waitUntil(
    countStreamSize(stream1)
      .then((size) => {
        context.log.info(`Response body size: ${size} bytes`);
      })
      .catch((err) => {
        context.log.error("Failed to count response body size", { err });
      })
  );

  // Return the response using the second stream
  const newResponse = new Response(stream2, response);

  return newResponse;
}

// Helper to count bytes in a readable stream
async function countStreamSize(
  stream: ReadableStream<Uint8Array>
): Promise<number> {
  const reader = stream.getReader();
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
  }

  return total;
}
