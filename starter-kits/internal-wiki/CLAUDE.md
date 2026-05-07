# Internal Wiki Kit

A Zuplo Starter Kit for an internal wiki / docs site. Replaces Notion, Confluence, Slab.

See [../CLAUDE.md](../CLAUDE.md) for the full conventions every kit follows.

## Key Files

| File | Purpose |
|------|---------|
| `config/routes.oas.json` | Routes + MCP annotations (Layer 1) + `/mcp` operations array (Layer 2) |
| `config/policies.json` | api-key-inbound, rate-limit, prompt-injection-outbound, secret-masking-outbound |
| `modules/repositories/pages.ts` | Page entity (the doc itself) |
| `modules/repositories/spaces.ts` | Space entity (a doc namespace) |
| `modules/repositories/revisions.ts` | Revision entity (page edit history) |
| `modules/repositories/comments.ts` | Comment entity |
| `modules/repositories/permissions.ts` | Permission row entity |
| `modules/handlers/*.ts` | One file per CRUD endpoint |
| `modules/mcp-tools/find-canonical-page-for-topic.ts` | Orchestrator: which page is "the" page for X |
| `modules/mcp-tools/flag-outdated-pages.ts` | Orchestrator: pages overdue for a refresh |
| `modules/mcp-tools/merge-duplicate-pages.ts` | Orchestrator: propose a merge of two duplicates |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/spaces` | List spaces |
| POST | `/spaces` | Create a space |
| GET | `/spaces/{id}` | Get a space |
| GET | `/pages` | List pages (filter by space, status) |
| GET | `/pages/search?q=` | Substring search across title/body |
| POST | `/pages` | Create a page |
| GET | `/pages/{id}` | Get a page |
| PATCH | `/pages/{id}` | Update a page (writes a revision) |
| PATCH | `/pages/{id}/publish` | Publish a draft |
| DELETE | `/pages/{id}/archive` | Archive (soft delete) |
| GET | `/pages/{id}/revisions` | List revisions |
| GET | `/pages/{id}/comments` | List comments |
| POST | `/pages/{id}/comments` | Add a comment |
| POST | `/permissions` | Upsert a permission row |
| POST | `/find-canonical-page-for-topic` | Orchestrator |
| POST | `/flag-outdated-pages` | Orchestrator |
| POST | `/merge-duplicate-pages` | Orchestrator |
| POST | `/mcp` | MCP server endpoint |

## Orchestrator rationale

`find_canonical_page_for_topic` is the single tool that pays for the wiki. Every assistant question that starts "where's the doc on…" hits this — it ranks pages by keyword match weight + viewCount + recency and returns the top hits, so the LLM never has to invent a URL.

`flag_outdated_pages` finds the pages most likely to be lying — published more than N days ago and never touched again. Drives weekly "what should we refresh?" prompts.

`merge_duplicate_pages` deliberately *proposes* rather than mutates. It picks a winner by viewCount + recency, returns a concatenated body the LLM can post via update_page on the winner, and tells the caller to archive the loser. Keeping the destructive steps as separate tool calls means a human (or an LLM-with-confirmation) controls the final write.

## Verifying the kit boots

```bash
cp env.example .env
npm install
npm run dev
# In another terminal:
npx @modelcontextprotocol/inspector
# Connect to http://localhost:9000/mcp
```

The Inspector should show 17 tools — `list_spaces`, `get_space`, `create_space`, `list_pages`, `get_page`, `search_pages`, `create_page`, `update_page`, `publish_page`, `archive_page`, `list_revisions`, `list_comments`, `add_comment`, `set_permission`, `find_canonical_page_for_topic`, `flag_outdated_pages`, `merge_duplicate_pages`.
