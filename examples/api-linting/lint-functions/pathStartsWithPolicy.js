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

  if (!functionOptions?.startsWith) {
    throw new Error("The option startsWith is not set");
  }
  console.log(JSON.stringify(input));
  if (typeof input !== "object") {
    throw new Error("Invalid input");
  }
  const results = Object.keys(input).filter(
    (key) => !key.startsWith(functionOptions.startsWith)
  );

  return results.map((key) => ({
    message: `The route '${key}' does not start with the required value '${functionOptions.startsWith}'`,
  }));
}
