# MCP Server Prompts

This is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server built with [Zuplo](https://zuplo.com) that demonstrates how to implement MCP tools and prompts using an OpenAPI-defined API.

## About this example

This project implements a **Bookmark Manager** with MCP integration that showcases:

### MCP Tools
- **`list-bookmarks`** - List saved bookmarks with optional tag filtering
- **`save-bookmark`** - Save a new bookmark with URL, title, and tags
- **`delete-bookmark`** - Delete a bookmark by ID

### MCP Prompts
- **`research-roundup`** - An AI prompt that analyzes recent bookmarks to identify research patterns, themes, and suggest next steps

### Key Components
- **OpenAPI-based Routes** (`config/routes.oas.json`) - API routes with MCP annotations
- **Research Prompt** (`modules/research-roundup-prompt.ts`) - Custom MCP prompt implementation

## Prerequisites

- A Zuplo account. You can [sign up for free](https://portal.zuplo.com/signup).

## Getting Started

### Locally
Working locally is the best way to explore and understand the code for this example. You can get a local version by using the Zuplo CLI:

```
npx create-zuplo-api@latest --example mcp-server-prompts
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

```
npx @modelcontextprotocol/inspector
```

### MCPJam

```
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
- 3 tools for managing bookmarks
- 1 prompt for analyzing your research patterns

## Learn More

- [Zuplo MCP Documentation](https://zuplo.com/docs/mcp-server/introduction)
- [Model Context Protocol Docs](https://modelcontextprotocol.io)
