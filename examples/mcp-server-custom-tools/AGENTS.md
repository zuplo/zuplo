# MCP Custom Tools

MCP Server with a custom tool that orchestrates multiple API calls.

## Key Files

| File | Purpose |
|------|--------|
| `config/routes.oas.json` | Route definitions with policies |
| `config/policies.json` | Policy configurations |
| `modules/plan-trip.ts` | Custom module |
| `docs/` | Zudoku documentation portal |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/weather/{city}` | Get weather forecast for a city |
| GET | `/activities/{city}` | Get recommended activities for a city |
| GET | `/packing/{climate}` | Get packing suggestions for a climate type |
| POST | `/plan-trip` | Plan a trip to a destination |
| POST | `/mcp` | Travel Advisor MCP |

## Getting Started

**Create a local copy:**
```bash
npx create-zuplo-api@latest --example mcp-server-custom-tools
```

**Run locally:**
```bash
npm install
npm run dev
# Server runs on https://localhost:9000
```

**Deploy to Zuplo:**
```bash
zuplo deploy
```
Or use the [Deploy to Zuplo](https://zuplo.com/docs/examples/mcp-server-custom-tools) button.

## Test Commands

```bash
# Get weather forecast for a city
curl http://localhost:9000/weather/{city}

# Get recommended activities for a city
curl http://localhost:9000/activities/{city}

# Get packing suggestions for a climate type
curl http://localhost:9000/packing/{climate}

```

## Policies Used

- **rate-limit-inbound** (Built-in): rate-limit-inbound

## Environment Variables

Set these in `.env` locally or in Zuplo Portal > Settings > Environment Variables:

- `BASE_URL`

## Related Docs

- [MCP Server Documentation](https://zuplo.com/docs/mcp-server/introduction)
- [Zuplo Documentation](https://zuplo.com/docs)
- [Policies Reference](https://zuplo.com/docs/policies)
