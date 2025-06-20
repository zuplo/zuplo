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
```
In order to work with the API key authentication service locally, you'll need to link your Zuplo account by running:

```bash
npx zuplo link
```

Then you can start running the project with:

```bash
npm run dev
```

This will start the Zuplo Gateway, and the Route Designer where you can check how the routes and policies in this project are wired together.

To see the setup for the MCP server, open the `mcp.oas.json` file in the Route Designer.

## Making Requests to the MCP Server

With the project running locally, you can test the MCP server using the [Model Context Protocol Inspector](https://modelcontextprotocol.io/docs/tools/inspector).

Inspector can be run locally:

```bash
npx @modelcontextprotocol/inspector
```

Open the Inspector using the URL that it outputs to your terminal and set the server connection as follows:

- Transport Type: Streamable HTTP
- URL: `https://localhost:9000/mcp`
- Authentication Header Name: `Authorization`
- Bearer Token: The API Key you created.

Then click on Connect.

Once the server is connected, you should be able to List Tools to see, and work with, the various tools the MCP server exposes for the Todo List API

## Secret Masking in Action

In order to demonstrate [Secret Masking](https://zuplo.com/docs/policies/secret-masking-outbound), this project includes a transformer that adds an "exposed" API key into the list of Todos (it's number 3). The file can be found at `modules/transform-body-outbound.ts`.

When running the `get_todos` tool in the Inspector, you will see that todo ID 3 is set to:

```json
{
    userId: 1,
    id: 3,
    title: "Update API key to [REDACTED]",
    completed:false
}
```

This is the Secret Masking policy in action. If you remove the policy from the `/mcp` route in `mcp.oas.json` and run the tool again, you will now see the API token exposed in plain sight.

## Prompt Injection Detection

This policy is set to check all responses for poisonous injections that could cause the LLMs underlying the service you connect your MCP server to to behave strangely, share information they aren't supposed to, or just quack like a duck.

The policy runs a simple agent on whatever model you specify that checks for likely prompt injection, and if discovered, it will fail the response with a 400 error.

For more on how this works, see the [Prompt Injection Detection documentation](https://zuplo.com/docs/policies/prompt-injection-outbound).

## Prompt Injection Detection: Working Locally with Ollama

When working locally, if you don't want to use OpenAI as the service behind the Prompt Injection Detection policy, you can use [Ollama](https://ollama.com/) to serve whatever model you wish to use locally.

The model must be OpenAI API compatible and support tool/function calling. Our recommendation is the small `qwen3:0.6b` model.

Run the model locally:

```bash
ollama serve qwen3:0.6b
```

Then update the handler for the `PromptInjectionDetectionOutboundPolicy` in `config/policies.json` to:

```json
"handler": {
    "module": "$import(@zuplo/runtime)",
    "export": "PromptInjectionDetectionOutboundPolicy",
    "options": {
        "apiKey": "na",
        "baseUrl": "http://localhost:11434/v1",
        "model": "qwen3:0.6b"
    }
}
```
