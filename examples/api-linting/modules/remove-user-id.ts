import { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { Todo } from "./types"
/**
 * This is a simple outbound policy that will remove the 'userId'
 * property from the todoItem as it passes out through the gateway
 */

export default async function (
  response: Response,
) {
  
  // read the response body as json as 
  // it enters the response pipeline
  const data: Todo[] = await response.json();

  data.forEach(item => {
    delete item.userId;
  });

  return new Response(JSON.stringify(data, null, 2), { status: 200 });
}