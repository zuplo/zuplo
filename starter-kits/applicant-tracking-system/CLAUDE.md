# Applicant Tracking System (ATS) Kit

A Zuplo Starter Kit for managing jobs, candidates, applications, interviews, and scorecards. Replaces Greenhouse, Lever, and Ashby.

See [../CLAUDE.md](../CLAUDE.md) for the full conventions every kit follows.

## Key Files

| File | Purpose |
|------|---------|
| `config/routes.oas.json` | Routes + MCP annotations (Layer 1) + `/mcp` operations array (Layer 2) |
| `config/policies.json` | api-key-inbound, rate-limit, prompt-injection-outbound, secret-masking-outbound |
| `modules/repositories/jobs.ts` | Job entity + repository |
| `modules/repositories/candidates.ts` | Candidate entity + repository |
| `modules/repositories/applications.ts` | Application entity + repository (the pipeline join) |
| `modules/repositories/interviews.ts` | Interview entity + repository |
| `modules/repositories/scorecards.ts` | Scorecard entity + repository |
| `modules/handlers/*.ts` | One file per CRUD endpoint |
| `modules/mcp-tools/summarize-candidate.ts` | Orchestrator MCP tool |
| `modules/mcp-tools/compare-candidates.ts` | Orchestrator MCP tool |
| `modules/mcp-tools/pipeline-health-for-job.ts` | Orchestrator MCP tool |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/jobs` | List jobs |
| POST | `/jobs` | Create job |
| GET | `/jobs/{id}` | Get job |
| GET | `/candidates` | List candidates |
| POST | `/candidates` | Create candidate |
| GET | `/applications` | List applications |
| POST | `/applications` | Create application |
| GET | `/applications/{id}` | Get application |
| PATCH | `/applications/{id}` | Move pipeline stage |
| GET | `/interviews` | List interviews |
| POST | `/interviews` | Schedule interview |
| POST | `/scorecards` | Submit scorecard |
| POST | `/summarize-candidate` | Orchestrator |
| POST | `/compare-candidates` | Orchestrator |
| POST | `/pipeline-health-for-job` | Orchestrator |
| POST | `/mcp` | MCP server endpoint |

## Orchestrator rationale

Hiring is read-heavy: managers consume summaries far more than they update records. The three orchestrators map to the three highest-frequency reads.

`summarize_candidate` is the headline tool. It calls `list_applications` through `context.invokeRoute` (so tenant scoping is preserved), reads matching scorecards directly from the repository, and returns a chronological timeline so the LLM can draft an interview-prep packet.

`compare_candidates` accepts an array of application ids (typically all on the same job) and returns aggregated scorecard data — average rating per competency, recommendation distribution. This is the debrief view a hiring manager wants before a decision meeting.

`pipeline_health_for_job` answers funnel questions: counts per stage and average days-in-stage. This surfaces stalled candidates without writing a SQL query.

## Verifying the kit boots

```bash
cp env.example .env
npm install
npm run dev
# In another terminal:
npx @modelcontextprotocol/inspector
# Connect to http://localhost:9000/mcp
```

The Inspector should show 15 tools: `list_jobs`, `get_job`, `create_job`, `list_candidates`, `create_candidate`, `list_applications`, `get_application`, `create_application`, `move_application_stage`, `list_interviews`, `schedule_interview`, `submit_scorecard`, `summarize_candidate`, `compare_candidates`, `pipeline_health_for_job`.
