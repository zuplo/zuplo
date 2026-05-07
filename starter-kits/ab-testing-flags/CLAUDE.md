# A/B Testing & Feature Flag API

Experiments, variants, flags, and assignments with MCP tools that interpret results, kill underperforming variants, and propose experiments.

See [../CLAUDE.md](../CLAUDE.md) for the full conventions every kit follows.

## Routes

| Method | Path | Operation ID | MCP |
|---|---|---|---|
| GET | `/assignment/{id}` | `get_assignment` | tool |
| POST | `/event` | `record_event` | tool |
| POST | `/experiment` | `create_experiment` | tool |
| GET | `/experiment/{id}` | `get_experiment` | tool |
| POST | `/experiment/{id}/complete` | `complete_experiment` | tool |
| POST | `/experiment/{id}/pause` | `pause_experiment` | tool |
| POST | `/experiment/{id}/start` | `start_experiment` | tool |
| GET | `/experiments` | `list_experiments` | tool |
| POST | `/flag` | `create_flag` | tool |
| PATCH | `/flag/{id}` | `update_flag` | tool |
| GET | `/flags` | `list_flags` | tool |
| POST | `/interpret-results` | `interpret_results` | tool |
| POST | `/kill-underperforming-variant` | `kill_underperforming_variant` | tool |
| POST | `/propose-experiment-for-metric` | `propose_experiment_for_metric` | tool |
| GET | `/results` | `list_results` | tool |
| POST | `/mcp` | `mcp_handler` | — |

## MCP tools

15 tools across both layers (per-route `mcp: { type: "tool" }` annotations and the `/mcp` route's `operations: [...]` array):

- `complete_experiment`
- `create_experiment`
- `create_flag`
- `get_assignment`
- `get_experiment`
- `list_experiments`
- `list_flags`
- `list_results`
- `pause_experiment`
- `record_event`
- `start_experiment`
- `update_flag`
- `interpret_results`
- `kill_underperforming_variant`
- `propose_experiment_for_metric`

## Verifying the kit

```bash
cp env.example .env
npm install
npm run dev
```

In another terminal, connect an MCP inspector to `http://localhost:9000/mcp`. The tool list should match the 15 entries above.

## Replaces

- Optimizely
- LaunchDarkly
- Statsig
