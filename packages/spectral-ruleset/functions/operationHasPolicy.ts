// This function will check an API doc to verify that any tag that appears on
// an operation is also present in the global tags array.

import type { IFunctionResult } from "@stoplight/spectral-core";
import { createRulesetFunction } from "@stoplight/spectral-core";
import { getAllOperations } from "./utils/getAllOperations.js";
import { isObject } from "./utils/isObject.js";

export default createRulesetFunction<any, { name: string; type: string }>(
  {
    input: null,
    options: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: {
          type: "string",
        },
        type: {
          type: "string",
          enum: ["inbound", "outbound"],
        },
      },
      required: ["name", "type"],
    },
  },
  (targetVal, options) => {
    if (!isObject(targetVal)) return;
    const results: IFunctionResult[] = [];

    const { paths } = targetVal;

    for (const { path, operation, value } of getAllOperations(paths)) {
      if (!isObject(value)) continue;

      const zuploRoute = value["x-zuplo-route"] as {
        policies?: { inbound?: string[]; outbound?: string[] };
      };

      if (
        !isObject(zuploRoute) ||
        !zuploRoute.policies?.[
          options.type as "inbound" | "outbound"
        ]?.includes(options.name)
      ) {
        results.push({
          message: `Operation must have ${options.type} policies defined in x-zuplo-route`,
          path: ["paths", path, operation, "x-zuplo-route", "policies"],
        });
        continue;
      }
    }

    return results;
  }
);
