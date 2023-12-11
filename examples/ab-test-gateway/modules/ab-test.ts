import { KeyValueStore, ZuploContext, ZuploRequest } from "@zuplo/runtime";

// Set this value to determine what percent of users get the 'test' endpoint
const FLIGHT_PERCENT = 0.5;

export default async function abTest(
  request: ZuploRequest,
  context: ZuploContext,
) {
  if (!request.user?.sub) {
    throw new Error("The A/B test policy requires authentication");
  }
  const { sub } = request.user;
  const key = `my-ab-test-${sub}`;

  const kv = new KeyValueStore(context);
  let val = await kv.get(key, {
    // Cache the result to decrease lookup time
    // tradeoff is the potential for the user to get assigned
    // different test groups due to geo-distributed eventual consistency
    cacheSecondsTtl: 60,
  });
  if (!val) {
    const rand = Math.random();
    // If the number is less than the flight percent assign the user
    // to the 'test' group, otherwise they are 'control'
    val = rand < FLIGHT_PERCENT ? "test" : "control";
    await kv.put(key, val, {
      // Keep the user in the same test for 24 hours
      expirationSecondsTtl: 60 * 60 * 24,
    });
  }

  if (val === "test") {
    context.custom.apiUrl = "gateway://my-zuplo-project-2";
  } else {
    context.custom.apiUrl = "gateway://my-zuplo-project-1";
  }

  return request;
}
