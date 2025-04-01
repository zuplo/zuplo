import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

type MyPolicyOptionsType = {
  myOption: any;
};

/**
 * This policy counts the size of the outbound response body
 * while streaming the response to the user. Using this method is 
 * prefered to reading the entire body in memory and sending it as
 * that will introduce latency and other potential performance issues.
 */
export default async function policy(
  response: Response,
  request: ZuploRequest,
  context: ZuploContext,
  options: MyPolicyOptionsType,
  policyName: string
) {

  if (!response.body) {
    // No body to stream
    return response;
  }

  // Tee the response body: create two identical readable streams
  const [stream1, stream2] = response.body.tee();

  // Size counter (async, runs in background)
  countStreamSize(stream1).then(size => {
    context.log.log(`Response body size: ${size} bytes`);
  });

  // Return the response using the second stream
  const newResponse = new Response(stream2, response);

  return newResponse;
}

// Helper to count bytes in a readable stream
async function countStreamSize(stream) {
  const reader = stream.getReader();
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
  }

  return total;
}
