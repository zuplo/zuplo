import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

export function rateLimit(request: ZuploRequest, context: ZuploContext) {
  // `api-key-inbound` runs before this policy and always populates
  // `request.user`; the `!` narrows the type without altering behavior
  // (the identifier function must return rate-limit config, not a Response).
  const user = request.user!;

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