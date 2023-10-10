/**
 * Global Vacuum context
 * https://quobix.com/vacuum/api/custom-javascript-functions/#access-to-context
 */
declare var context: Context;

// Core functions
// https://github.com/daveshanley/vacuum/tree/main/functions/core
declare var vacuum_schema: CoreFunction;
declare var vacuum_alphabetical: CoreFunction;
declare var vacuum_blank: CoreFunction;
declare var vacuum_casing: CoreFunction;
declare var vacuum_defined: CoreFunction;
declare var vacuum_enumeration: CoreFunction;
declare var vacuum_falsy: CoreFunction;
declare var vacuum_length: CoreFunction;
declare var vacuum_pattern: CoreFunction;
declare var vacuum_schema: CoreFunction;
declare var vacuum_truthy: CoreFunction;
declare var vacuum_undefined: CoreFunction;
declare var vacuum_xor: CoreFunction;

interface Context {
  ruleAction: RuleAction;
  rule: Rule;
  given: any;
  options: any;
  specInfo: SpecInfo;
}

interface SpecInfo {
  fileType: string;
  format: string;
  type: string;
  version: string;
}

interface RuleAction {
  field: string;
  functionOptions?: Record<string, any>;
}

interface Rule {
  id: string;
  description: string;
  given: any;
  formats: string[];
  resolved: boolean;
  recommended: boolean;
  type: string;
  severity: string;
  then: any;
  ruleCategory: RuleCategory;
  howToFix: string;
}

interface RuleCategory {
  id: string;
  name: string;
  description: string;
}

interface RuleFunctionResult {
  severity?: "error" | "warn";
  message: string;
}

interface CoreFunction {
  (input: unknown, context: Context): RuleFunctionResult[];
}
