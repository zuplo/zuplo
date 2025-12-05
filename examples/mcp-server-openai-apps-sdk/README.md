An MCP (Model Context Protocol) server built with Zuplo that provides interactive GitHub profile statistics with rich visual rendering in ChatGPT using the [OpenAI Apps SDK](https://developers.openai.com/apps-sdk/).

## What This Example Does

When connected to ChatGPT, this MCP server provides a `get_github_stats` tool that:

1. Accepts any GitHub username as a parameter
2. Fetches their profile data (repos, followers, stars, languages)
3. Returns a summary for the AI to reason about
4. Renders an **interactive visual widget** showing:
   - Profile header with avatar and bio
   - Stats cards (repos, stars, followers, forks)
   - Language distribution bar chart
   - Top repositories list
   - **Search box to look up any other GitHub user**

This demonstrates how the OpenAI Apps SDK enables rich, interactive visualizations that would be impossible with text-only MCP responses.

## Interactive Features

The widget includes a search input that lets users explore different GitHub profiles without leaving the widget:

- Initial data is loaded when you ask about a user
- Type any username in the search box and click "Search"
- The widget calls `window.openai.callTool()` to fetch new data
- Charts and stats update in real-time

**Example prompts:**
- *"Show me GitHub stats for Zuplo"*

## Configuration

### Optional: Environment Variables

Set these in your Zuplo project settings:

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_USERNAME` | No | Fallback username if none specified in the request |
| `GITHUB_TOKEN` | No | GitHub Personal Access Token for higher rate limits (60 → 5000 requests/hour) |

### Setting Environment Variables in Zuplo

1. Go to your Zuplo project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. (Optional) Add `GITHUB_USERNAME` as a default fallback
4. (Recommended) Add `GITHUB_TOKEN` with a [GitHub Personal Access Token](https://github.com/settings/tokens) for better rate limits

## Deployment

### Prerequisites

- A [Zuplo](https://zuplo.com) account

### Deploy to Zuplo

1. **Set up the project using a template**
   ```bash
   npx create-zuplo-api@latest --example mcp-server-openai-apps-sdk
   ```

2. **Deploy to Zuplo**
   ```bash
   npx zuplo deploy
   ```

3. **Get your MCP endpoint URL**
   Your MCP server will be available at:
   ```
   https://<your-project>.zuplo.app/mcp
   ```

## Connecting to ChatGPT

1. Open ChatGPT (in Developer Mode) and go to **Settings** → **Connected Apps**
2. Add a new MCP server with your Zuplo endpoint URL
3. Ask ChatGPT: *"Show me GitHub stats for octocat"*

## Local Development

You can make changes to the code and develop this example locally by running

```bash
npm run dev
```

This starts the Zuplo dev server, and a local version of the Zuplo Route Designer.

## Resources

- [Zuplo MCP Server Docs](https://zuplo.com/docs/mcp-server/introduction)
- [Zuplo OpenAI Apps SDK Integration](https://zuplo.com/docs/mcp-server/openai-apps-sdk)
- [OpenAI Apps SDK](https://developers.openai.com/apps-sdk/)
