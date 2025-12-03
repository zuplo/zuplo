# MCP Server Custom Tools

This is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server built with [Zuplo](https://zuplo.com) that demonstrates how to create custom MCP tools that orchestrate multiple API calls using an OpenAPI-defined API.

## About this example

This project implements a **Travel Advisor** with MCP integration that showcases:

### MCP Custom Tool
- **`plan-trip`** - A custom tool that aggregates weather forecasts, activity recommendations, and packing suggestions into a comprehensive travel brief for any destination

### Key Features
This example demonstrates how to build an MCP tool that:
- **Orchestrates multiple API calls** - The `plan-trip` tool internally calls three separate endpoints (`/weather`, `/activities`, `/packing`)
- **Processes and combines data** - Analyzes weather patterns to filter activities and adjust packing recommendations
- **Returns structured responses** - Provides a single, comprehensive JSON response optimized for LLM consumption

### Key Components
- **OpenAPI-based Routes** (`config/routes.oas.json`) - API routes with MCP annotations
- **Custom Tool Handler** (`modules/plan-trip.ts`) - Orchestration logic that combines multiple data sources

## Prerequisites

- A Zuplo account. You can [sign up for free](https://portal.zuplo.com/signup).

## Getting Started

### Locally

Working locally is the best way to explore and understand the code for this example. You can get a local version by using the Zuplo CLI:

```
npx create-zuplo-api@latest --example mcp-server-custom-tools
```

### Environment Setup

Copy the example environment file and configure the `BASE_URL`:

```bash
cp env.example .env
```

For the `BASE_URL`, you can use the provided Mockbin API:
```
BASE_URL=https://deb522471fb24e4b842dc20ea3a01c75_oas.api.mockbin.io
```

Alternatively, upload the `travel-plan-api-oas.json` file to [Mockbin](https://mockbin.com) or another mock API service to create your own endpoints.

**Note:** When deploying to Zuplo, set environment variables in the **Settings > Environment Variables** section of your project in the Zuplo Portal.

Once you have the code on your local machine and environment configured, start the development server:

```bash
npm run dev
```

The API will be available at [http://localhost:9000](http://localhost:9000).

You can access:
- **API Gateway** - `http://localhost:9000`
- **Local API Route Designer** - `http://localhost:9100`
- **MCP Endpoint** - `http://localhost:9000/mcp` (POST)

The dev server will automatically reload when you modify:
- Route definitions in `config/routes.oas.json`
- Handler modules in `modules/`

## Deploying with Zuplo CLI

### Install the Zuplo CLI

```bash
npm install -g zuplo
```

### Login to Zuplo

```bash
zuplo login
```

### Create a New Project

```bash
zuplo init
```

Follow the prompts to create a new project in your Zuplo account.

### Deploy to Zuplo

Deploy to a working copy environment:

```bash
zuplo deploy
```

## Using the MCP Server

Once deployed, you can connect to your MCP server using any MCP testing tool:

### Model Context Protocol Inspector

```bash
npx @modelcontextprotocol/inspector
```

### MCPJam

```bash
npx @mcpjam/inspector@latest
```

You can then test the MCP server locally, or point your inspector at a deployed version.

### Local MCP Server

```
http://localhost:9000/mcp
```

### Deployed MCP Server

```
https://your-project.zuplo.app/mcp
```

The server will expose 1 custom tool, `plan-trip`, that demonstrates API orchestration for travel planning.

## Example Usage

Try asking the MCP tool:
- "I'm planning a trip to Tokyo, what should I know?"
- "Help me plan a trip to Tokyo"
- "What should I pack for Tokyo"

The tool will automatically fetch weather data, recommend activities, and suggest packing items based on the destination's climate.

## Learn More

- [Zuplo MCP Documentation](https://zuplo.com/docs/mcp-server/introduction)

