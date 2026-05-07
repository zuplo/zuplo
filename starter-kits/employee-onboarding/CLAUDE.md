# Employee Onboarding Kit

A Zuplo Starter Kit for managing new-hire onboarding — hires, reusable task templates, and per-hire checklists. Replaces Sapling, ChartHop onboarding, and Workday onboarding.

See [../CLAUDE.md](../CLAUDE.md) for the full conventions every kit follows.

## Key Files

| File | Purpose |
|------|---------|
| `config/routes.oas.json` | Routes + MCP annotations (Layer 1) + `/mcp` operations array (Layer 2) |
| `config/policies.json` | api-key-inbound, rate-limit, prompt-injection-outbound, secret-masking-outbound |
| `modules/repositories/hires.ts` | Hire entity + repository |
| `modules/repositories/onboarding-tasks.ts` | OnboardingTask entity + repository |
| `modules/repositories/onboarding-templates.ts` | OnboardingTemplate entity + repository |
| `modules/handlers/*.ts` | One file per CRUD endpoint |
| `modules/mcp-tools/create-onboarding-plan.ts` | Orchestrator MCP tool |
| `modules/mcp-tools/check-overdue-tasks.ts` | Orchestrator MCP tool |
| `modules/mcp-tools/notify-buddy.ts` | Orchestrator MCP tool |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/hires` | List hires |
| POST | `/hires` | Create hire |
| GET | `/hires/{id}` | Get hire |
| GET | `/tasks` | List tasks |
| POST | `/tasks` | Create task |
| PATCH | `/tasks/{id}/complete` | Mark task done |
| GET | `/templates` | List templates |
| POST | `/templates` | Create template |
| POST | `/create-onboarding-plan` | Orchestrator |
| POST | `/check-overdue-tasks` | Orchestrator |
| POST | `/notify-buddy` | Orchestrator |
| POST | `/mcp` | MCP server endpoint |

## Orchestrator rationale

`create_onboarding_plan` is the headline tool. Materialising a template into a per-hire schedule is the highest-friction onboarding chore — the orchestrator reads the template, calls `create_task` through `context.invokeRoute` once per TaskTemplate (so the same validation runs on every task), then back-fills the dependsOn graph in a second pass.

`check_overdue_tasks` is read-only and answers "what's slipping?" by listing tasks via `list_tasks`, filtering on dueDate < today and status != done, and grouping by ownerEmail.

`notify_buddy` reads the hire + the buddy-category tasks for the first week and returns a *draft* notification payload. It deliberately does not send email — agents can review and forward to whatever transactional-email tool they prefer. This is a common pattern for agent-friendly APIs: surface the structured payload, let the LLM decide whether to dispatch.

## Verifying the kit boots

```bash
cp env.example .env
npm install
npm run dev
# In another terminal:
npx @modelcontextprotocol/inspector
# Connect to http://localhost:9000/mcp
```

The Inspector should show 11 tools: `list_hires`, `get_hire`, `create_hire`, `list_tasks`, `create_task`, `complete_task`, `list_templates`, `create_template`, `create_onboarding_plan`, `check_overdue_tasks`, `notify_buddy`.
