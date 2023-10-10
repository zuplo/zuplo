/**
 * Validates that the input has a specific policy set.
 *
 *
 * @param {unknown} input - The input can be either a primitive value, or a
 * complex value (like an object or an array). It all depends on how the rule
 * is configured to use the function, and what the given property is set to.
 *
 * See: https://quobix.com/vacuum/api/custom-javascript-functions/#the-input-argument
 * @returns {RuleFunctionResult[]} Returns an array of objects with a message property
 */
function runRule(input) {
  const functionOptions = context.ruleAction.functionOptions;

  if (!functionOptions?.policyName) {
    throw new Error("The option policyName is not set");
  }
  // if (!functionOptions?.policyType) {
  //   throw new Error(
  //     "The option policyType is not set. Valid options are 'inbound' our 'outbount'",
  //   );
  // }

  const hasPolicy =
    typeof input === "object" &&
    Array.isArray(input) &&
    input.includes(functionOptions.policyName);

  if (!hasPolicy) {
    return [
      {
        message: `The route does not have the required policy '${functionOptions.policyName}'`,
      },
    ];
  }
}
