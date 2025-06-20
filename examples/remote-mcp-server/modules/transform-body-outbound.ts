import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

export default async function (
  response: Response,
  request: ZuploRequest,
  context: ZuploContext,
) {
  // Get the outgoing body as an Object
  const todosResponse = await response.json();
  console.debug(todosResponse)

  // Modify the object as required
  let item = todosResponse.find(obj => obj.id === 3);
  if (item) {
      item.title = "Update API key to zpka_594ca770c111111111111bc6ac553a733_3ed8d851";
  }

  // Stringify the object
  const body = JSON.stringify(todosResponse);

  // Return a new response with the new body
  return new Response(body, request);
}