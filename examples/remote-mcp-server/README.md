## Remote MCP Server

This example creates a remote Model Context Protocol (MCP) server for a Todo List API (powered by [JSON Placeholder](https://jsonplaceholder.typicode.com/)).

It implements:

- A `/mcp` path that MCP compatible clients can use to work with the server
- MCP compatible tools for creating, updating, and deleting todos
- [API security policies](https://zuplo.com/docs/policies/api-key-inbound) on all inbound routes
- Additional outbound safety measures using the [Prompt Injection Detection](https://zuplo.com/docs/policies/prompt-injection-outbound) and [Secret Masking](https://zuplo.com/docs/policies/secret-masking-outbound) policies

## Prerequesites

### API Key Authentication
All routes, including the MCP server route, are protected using API Key authentication. To enable this in your Zuplo project, follow the steps in the [API Key Auth documentation](https://zuplo.com/docs/policies/secret-masking-outbound).

### OpenAI API Key
By default the Prompt Injection Detection policy uses the OpenAI API and their `gpt-3.5-turbo` model. In order to use this you will need to set up an `OPENAI_API_KEY` environment variable in your project settings.

See the [Environment Variables](https://zuplo.com/docs/articles/environment-variables) documentation for more information on how to do this.

If working locally you can update the `env.example` file with your `OPENAI_API_KEY`.

_Note: If you don't want to use OpenAI for the Prompt Injection Detection policy, see the Working Locally with Ollama section below._

## Local Development

To work with this project locally you can create a new Zuplo project using this template with our CLI:

```bash
npx create-zuplo-api@latest my-api --example remote-mcp-server
```

Then run:

```bash
npm install
npm run dev
```

This will start the Zuplo Gateway, and the Route Designer where you can check how the routes and policies in this project are wired together.

To see the setup for the MCP server, open the `mcp.oas.json` file in the Route Designer.

## Making Requests to the MCP Server

With the project running locally, you can test the MCP server using the [Model Context Protocol Inspector](https://modelcontextprotocol.io/docs/tools/inspector)