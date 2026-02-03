import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

export function rateLimit(request: ZuploRequest, context: ZuploContext) {
  const user = request.user;

  // premium customers get 1000 requests per mintue
  if (user.data.customerType === "premium") {
    return {
      key: user.sub,
      requestsAllowed: 1000,
      timeWindowMinutes: 1,
    };
  }

  // free customers get 5 requests per minute
  if (user.data.customerType === "free") {
    return {
      key: user.sub,
      requestsAllowed: 5,
      timeWindowMinutes: 1,
    };
  }

  // everybody else gets 30 requests per minute
  return {
    key: user.sub,
    requestsAllowed: 30,
    timeWindowMinutes: 1,
  };
}