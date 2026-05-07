import { defineWorkspace } from "vitest/config";

/**
 * Workspace config for running every kit's tests in one shot.
 *
 * Globs are resolved relative to the workspace file's directory. Each entry
 * is a project root that has its own `vitest.config.ts` (which all re-export
 * `@zuplo/starter-kit-shared/testing/vitest.config`).
 */
export default defineWorkspace([
  "./_shared",
  "./_template",
  "./*/vitest.config.ts",
]);
