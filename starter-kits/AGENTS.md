# AGENTS.md

See [CLAUDE.md](./CLAUDE.md) for the full conventions every starter kit follows.

Key rules for agents working in this directory:

- **Never** add a kit without registering its MCP tool `operationId`s in both layers (per-operation `mcp: { type: "tool" }` AND the `/mcp` route's `operations: [...]` array). One alone is silently broken.
- **Never** import a non-HTTP database driver (`pg`, `mongodb` native, `@cloudflare/d1`, etc.). Edge runtime constraint.
- **Always** require `tenantId` on every repository call. The type system enforces this — don't bypass it.
- **Always** use `context.invokeRoute()` for orchestrator-tool handlers calling sibling routes, not `fetch` to a public URL.
- **Always** add new kits to `starter-kits.json`.
- **Never** hand-edit `<kit>/modules/_shared/` — it's vendored from `starter-kits/_shared/`. Edit the canonical files and run `node starter-kits/_shared/regenerate-shared.mjs`.
- **Never** add `@zuplo/starter-kit-shared` to a kit's `package.json` — kits import the vendored copy via relative paths (e.g. `../_shared/mcp/helpers.ts`).
- Operation IDs are snake_case action verbs (`create_invoice`, not `createInvoice` or UUIDs).
