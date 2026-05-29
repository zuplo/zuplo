# AGENTS.md

See [CLAUDE.md](./CLAUDE.md) for the full conventions every starter kit follows.

Key rules for agents working in this directory:

- **Never** add a kit without registering its MCP tool `operationId`s in both layers (per-operation `mcp: { type: "tool" }` AND the `/mcp` route's `operations: [...]` array). One alone is silently broken.
- **Never** import a non-HTTP database driver (`pg`, `mongodb` native, `@cloudflare/d1`, etc.). Edge runtime constraint.
- **Always** require `tenantId` on every repository call. The type system enforces this — don't bypass it.
- **Always** use `context.invokeRoute()` for orchestrator-tool handlers calling sibling routes, not `fetch` to a public URL.
- **Always** add new kits to `starter-kits.json`.
- Operation IDs are snake_case action verbs (`create_invoice`, not `createInvoice` or UUIDs).
