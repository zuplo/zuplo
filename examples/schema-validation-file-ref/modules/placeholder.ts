// This example is config-only (routes/policies defined entirely in config/*.json) and ships
// no custom handlers or policies. This file exists solely so the canonical tsconfig.json's
// `include: ["modules/**/*", ...]` (see examples/schema-validation-file-ref/tsconfig.json) has at
// least one matching input — `tsc` reports TS18003 ("No inputs were found") for an include
// glob that resolves to zero files, and a `.gitkeep` alone does not satisfy it because
// TypeScript's file matching only picks up recognized extensions (.ts/.tsx/.d.ts) and skips
// dotfiles. Do not delete this file unless a real module is added under modules/, or the
// typecheck script is exempted for this example.
export {};
