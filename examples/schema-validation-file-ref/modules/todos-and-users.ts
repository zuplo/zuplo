import { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { Todo, User } from "./types"

/**
 * This is a custom Request Handler that calls two endpoints and merges
 * the results like a join.
 */

export default async function (request: ZuploRequest, context: ZuploContext) {
  // Get the todos and users list, run the requests in parallel for
  // maximum performance
  const todosPromise = fetch("https://jsonplaceholder.typicode.com/todos");
  const usersPromise = fetch("https://jsonplaceholder.typicode.com/users");

  // wait for both requests to complete before proceeding
  const [todosResponse, usersResponse] = await Promise.all([
    todosPromise,
    usersPromise,
  ]);

  const todos: Todo[] = await todosResponse.json();
  const users: User[] = await usersResponse.json();

  // use a map to join the data and create a new object
  const data = todos.map((todo) => {
    return {
      ...todo,
      user: users.find(user => user.id === todo.userId)
    };
  });

  // We can just return the data and let Zuplo serialize it
  return data;

}

