import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Shared vitest config for every starter kit. Each kit's `vitest.config.ts`
 * just imports and re-exports this. We alias `@zuplo/runtime` to a lightweight
 * stub because the real runtime ships gateway-only init that crashes outside
 * the gateway.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeStub = path.join(here, "runtime-stub.ts");

export const kitVitestConfig = defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globals: false,
    testTimeout: 10_000,
  },
  resolve: {
    alias: {
      "@zuplo/runtime": runtimeStub,
    },
  },
});

export default kitVitestConfig;
