This is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server built with [Zuplo](https://zuplo.com) that demonstrates how to expose GraphQL APIs as MCP tools with built-in introspection capabilities.

## About this example

This project implements an **MCP Server for GraphQL APIs** using the [Rick & Morty GraphQL API](https://rickandmortyapi.com) as an example. It showcases:

### MCP Tools
- **`graphql_introspect`** - Introspect the GraphQL schema to understand available types, queries, and mutations
- **`graphql_execute`** - Execute GraphQL queries and mutations against the API

### Key Features
- Automatic GraphQL schema introspection
- Execute any GraphQL query or mutation through MCP
- API key authentication for security
- Easy to adapt to any GraphQL API

### Key Components
- **OpenAPI-based Routes** (`config/routes.oas.json`) - API routes with MCP GraphQL annotations
- **GraphQL Proxy** - Proxies requests to the Rick & Morty GraphQL API
- **MCP GraphQL Integration** - Built-in support for GraphQL introspection and execution

## Prerequisites

- A Zuplo account. You can [sign up for free](https://portal.zuplo.com/signup).

## Getting Started

### Locally
Working locally is the best way to explore and understand the code for this example. You can get a local version by using the Zuplo CLI:

```bash
npx create-zuplo-api@latest --example mcp-server-graphql
```

Once you have the code on your local machine, start the development server:

```bash
npm run dev
```

The API will be available at [http://localhost:9000](http://localhost:9000).

You can access:
- **API Gateway** - `http://localhost:9000`
- **Local API Route Designer** - `http://localhost:9100`
- **MCP Endpoint** - `http://localhost:9000/mcp` (POST)
- **GraphQL Endpoint** - `http://localhost:9000/graphql` (POST)

The dev server will automatically reload when you modify:
- Route definitions in `config/routes.oas.json`
- Policy configurations in `config/policies.json`

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

### Deployed

```
https://your-project.zuplo.app/mcp
```

The server will expose:
- GraphQL introspection tool to explore the API schema
- GraphQL execution tool to run queries and mutations

### Example Usage

Add the MCP server to your tool of choice and ask _"Which characters were in season 4, episode 6 of Rick & Morty, and what was the name of the episode?"_

## Learn More

- [Zuplo MCP Documentation](https://zuplo.com/docs/mcp-server/introduction)
- [Zuplo GraphQL MCP Guide](https://zuplo.com/docs/mcp-server/graphql)
- [Blog Post & Video Demo](https://zuplo.com/blog/mcp-server-graphql)
- [Rick & Morty GraphQL API](https://rickandmortyapi.com/documentation)

