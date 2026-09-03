import { InboundPolicyHandler, ZuploRequest } from "@zuplo/runtime";

const rewriteBody: InboundPolicyHandler = async (request, context) => {
  // Read the incoming body
  const body = await request.json();

  // Create a new body with additional properties
  const outbound = {
    ...body,
    id: crypto.randomUUID(),
    createdOn: new Date(),
  };

  // Return a new request with the modified body
  return new ZuploRequest(request, {
    body: JSON.stringify(outbound),
  });
};

export default rewriteBody;
