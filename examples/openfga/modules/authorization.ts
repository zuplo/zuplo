import {
  ConfigurationError,
  HttpProblems,
  ZuploContext,
  ZuploRequest,
} from "@zuplo/runtime";
import { checkAccess } from "./openfga";

type AuthorizationPolicyOptions = {
  relation: string;
  objectType: string;
  parameterName: string;
};

export default async function policy(
  request: ZuploRequest,
  context: ZuploContext,
  options: AuthorizationPolicyOptions,
  policyName: string,
) {
  // The route is setup with an extension `x-authorization` that configures the access
  // required for this request.
  //
  // "x-authorization": {
  //    "relation": "reader",
  //    "objectType": "document",
  //    "objectParam": "documentId"
  // }

  // Get the authorization options from the route
  const authOptions = context.route.raw<any>()["x-authorization"];
  if (!authOptions) {
    throw new ConfigurationError(
      "No authorization options configured for this route.",
    );
  }

  console.log("Checking authorization", authOptions);

  if (!request.user) {
    throw new ConfigurationError(
      "The authorization policy must come after an authentication policy.",
    );
  }

  try {
    await checkAccess({
      user: `user:${request.user.sub}`,
      relation: authOptions.relation,
      object: `${authOptions.objectType}:${
        request.params[authOptions.objectParam]
      }`,
    });
  } catch (err) {
    // User not authorized, return forbidden response
    context.log.error("User not authorized", err);
    return HttpProblems.forbidden(request, context);
  }

  return request;
}
