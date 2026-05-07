import { defineWorkspace } from "vitest/config";

/**
 * Workspace config for running every kit's tests in one shot.
 *
 * Globs are resolved relative to the workspace file's directory. Each entry
 * is a project root that has its own `vitest.config.ts` (which all re-export
 * the vendored `modules/_shared/testing/vitest.config.ts`).
 */
export default defineWorkspace([
  "./_shared",
  "./_template",
  "./*/vitest.config.ts",
]);
