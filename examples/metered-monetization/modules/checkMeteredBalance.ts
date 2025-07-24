import { environment,ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { OpenMeter } from '@openmeter/sdk'

const openmeter = new OpenMeter({
  baseUrl: 'https://openmeter.cloud',
  apiKey: environment.OPENMETER_API_KEY,
})

export default async function (request: ZuploRequest, context: ZuploContext) {

  console.log(request.user);

  const featureKey = environment.OPENMETER_FEATURE_KEY;
  if (!featureKey) {
    return new Response('Missing OPENMETER_FEATURE_KEY environment variable', { status: 500 });
  }

  const exists = await openmeter.subjects.get(request.user?.data.openmeter.subjectId);

  if (!exists) {
    console.log('Subject not found');
    return request;
  } else {

    const value = await openmeter.entitlements.value(
      request.user?.data.openmeter.subjectId, // Custom based on the metadata from the API key
      featureKey
    );

    console.log(value);

    const {
      hasAccess,
      balance, 
      usage, 
      overage,
    } = value;

    if (!hasAccess) {
      return new Response(`You have used all ${(usage || 0) - (overage || 0)} actions your subscription allows and your available balance is ${balance} please add more credits or upgrade.`, { status: 403 });
    } else {
      return request;
    }
  }
}
