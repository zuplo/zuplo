import { InboundPolicyHandler } from "@zuplo/runtime";

const rewriteBody: InboundPolicyHandler<{ apiKey: string }> = async (
  request,
  context,
  options,
  policyName
) => {
  // Read the incoming body
  const body = await request.json();

  // Create a new body with additional properties
  const outbound = {
    ...body,
    id: crypto.randomUUID(),
    createdOn: new Date(),
  };

  // Return the request with the new body
  return new Response(JSON.stringify(outbound), request);
};

export default rewriteBody;
