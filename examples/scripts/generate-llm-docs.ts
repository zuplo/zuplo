/**
 * Script to generate LLM instruction files for each Zuplo example.
 *
 * Generates the following files for each example:
 * - CLAUDE.md - Claude Code instructions (generated from example metadata)
 * - AGENTS.md - Same as CLAUDE.md (for Goose and other tools)
 * - .cursorrules - Cursor IDE rules (shared content)
 * - .github/copilot-instructions.md - GitHub Copilot instructions (shared content)
 *
 * Run with: npx tsx scripts/generate-llm-docs.ts
 *
 * Options:
 *   --dry-run    Show what would be generated without writing files
 *   --example X  Only generate for a specific example (by slug)
 */

import * as fs from "fs";
import * as path from "path";

const EXAMPLES_DIR = path.join(__dirname, "..");
const EXAMPLES_JSON_PATH = path.join(EXAMPLES_DIR, "examples.json");

// Shared content for .cursorrules (applies to all examples)
const CURSORRULES_CONTENT = `# Zuplo API Gateway Examples

You are working in a Zuplo API Gateway examples repository.

## Project Structure
- config/routes.oas.json - OpenAPI routes with x-zuplo-route extensions
- config/policies.json - Policy configurations
- modules/*.ts - Custom handlers and policies
- Tests: npm run test

## Code Conventions
- TypeScript with @zuplo/runtime imports
- Handlers: export default async function(request: ZuploRequest, context: ZuploContext)
- Policies: export default async function(request, context, options, policyName)
- Return Response objects from handlers
- Return request (continue) or Response (short-circuit) from policies

## Common Patterns
- context.log.info() for logging
- context.custom for passing data between policies
- ZoneCache for distributed caching
- environment.VAR_NAME for env vars

## When Modifying Routes
- Edit config/routes.oas.json
- Add handler reference in x-zuplo-route.handler
- Add policies in x-zuplo-route.policies.inbound/outbound

## Local Development
- npm run dev starts server on https://localhost:9000
- Hot reload is automatic
`;

// Shared content for .github/copilot-instructions.md
const COPILOT_INSTRUCTIONS_CONTENT = `# GitHub Copilot Instructions for Zuplo Examples

This repository contains example API gateway projects built with Zuplo.

## Project Structure

Each example follows this structure:
- \`config/routes.oas.json\` - OpenAPI route definitions with \`x-zuplo-route\` extensions
- \`config/policies.json\` - Policy configurations for rate limiting, auth, caching, etc.
- \`modules/*.ts\` - Custom TypeScript handlers and policies
- \`package.json\` - Dependencies (always includes \`zuplo\` package)

## Code Patterns

### Handlers
\`\`\`typescript
import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

export default async function (
  request: ZuploRequest,
  context: ZuploContext
): Promise<Response> {
  return new Response(JSON.stringify({ data: "value" }), {
    headers: { "content-type": "application/json" }
  });
}
\`\`\`

### Custom Policies
\`\`\`typescript
import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

export default async function (
  request: ZuploRequest,
  context: ZuploContext,
  options: PolicyOptions,
  policyName: string
): Promise<ZuploRequest | Response> {
  // Return request to continue, or Response to short-circuit
  return request;
}
\`\`\`

## Key Imports
- \`ZuploContext\`, \`ZuploRequest\` - Core types from @zuplo/runtime
- \`ZoneCache\` - Distributed caching
- \`environment\` - Environment variables

## Common Operations
- Logging: \`context.log.info()\`, \`.warn()\`, \`.error()\`
- Pass data between policies: \`context.custom\`
- Access route metadata: \`context.route\`
- Authenticated user: \`request.user\`

## Commands
- \`npm run dev\` - Start local dev server
- \`npm run test\` - Run tests
- \`zuplo deploy\` - Deploy to Zuplo cloud
`;

// Skip these directories (already have hand-crafted CLAUDE.md or are special)
const SKIP_EXAMPLES = ["semantic-caching", "idempotency-keys"];

interface ExampleMetadata {
  title: string;
  slug: string;
  description: string;
  categories: string[];
  iconUrl?: string;
  date?: string;
}

interface ExamplesJson {
  categories: { slug: string; title: string }[];
  examples: ExampleMetadata[];
}

interface RouteInfo {
  path: string;
  method: string;
  operationId?: string;
  summary?: string;
  policies: { inbound: string[]; outbound: string[] };
  handler?: string;
}

interface PolicyInfo {
  name: string;
  policyType: string;
  isCustom: boolean;
}

interface ExampleAnalysis {
  metadata?: ExampleMetadata;
  routes: RouteInfo[];
  policies: PolicyInfo[];
  modules: string[];
  hasEnvExample: boolean;
  envVars: string[];
  hasReadme: boolean;
  hasDocs: boolean;
  readmeContent?: string;
}

function loadExamplesJson(): ExamplesJson {
  const content = fs.readFileSync(EXAMPLES_JSON_PATH, "utf-8");
  return JSON.parse(content);
}

function getExampleDirs(): string[] {
  const entries = fs.readdirSync(EXAMPLES_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => {
      if (!entry.isDirectory()) return false;
      if (entry.name.startsWith(".")) return false;
      if (entry.name === "scripts") return false;
      // Check if it has config/routes.oas.json
      const routesPath = path.join(
        EXAMPLES_DIR,
        entry.name,
        "config",
        "routes.oas.json"
      );
      return fs.existsSync(routesPath);
    })
    .map((entry) => entry.name);
}

function analyzeExample(slug: string, metadata?: ExampleMetadata): ExampleAnalysis {
  const exampleDir = path.join(EXAMPLES_DIR, slug);
  const analysis: ExampleAnalysis = {
    metadata,
    routes: [],
    policies: [],
    modules: [],
    hasEnvExample: false,
    envVars: [],
    hasReadme: false,
    hasDocs: false,
  };

  // Check for README.md
  const readmePath = path.join(exampleDir, "README.md");
  if (fs.existsSync(readmePath)) {
    analysis.hasReadme = true;
    analysis.readmeContent = fs.readFileSync(readmePath, "utf-8");
  }

  // Check for docs directory
  const docsPath = path.join(exampleDir, "docs");
  analysis.hasDocs = fs.existsSync(docsPath);

  // Check for env.example
  const envExamplePath = path.join(exampleDir, "env.example");
  if (fs.existsSync(envExamplePath)) {
    analysis.hasEnvExample = true;
    const envContent = fs.readFileSync(envExamplePath, "utf-8");
    analysis.envVars = envContent
      .split("\n")
      .filter((line) => line.includes("="))
      .map((line) => line.split("=")[0].trim())
      .filter((v) => v.length > 0 && !v.startsWith("#"));
  }

  // Parse routes.oas.json
  const routesPath = path.join(exampleDir, "config", "routes.oas.json");
  if (fs.existsSync(routesPath)) {
    try {
      const routesContent = fs.readFileSync(routesPath, "utf-8");
      const routesJson = JSON.parse(routesContent);
      if (routesJson.paths) {
        for (const [routePath, methods] of Object.entries(routesJson.paths)) {
          for (const [method, config] of Object.entries(methods as Record<string, unknown>)) {
            if (method.startsWith("x-")) continue;
            const routeConfig = config as Record<string, unknown>;
            const zuploRoute = routeConfig["x-zuplo-route"] as Record<string, unknown> | undefined;
            const route: RouteInfo = {
              path: routePath,
              method: method.toUpperCase(),
              operationId: routeConfig["operationId"] as string | undefined,
              summary: routeConfig["summary"] as string | undefined,
              policies: { inbound: [], outbound: [] },
            };
            if (zuploRoute) {
              const policies = zuploRoute["policies"] as Record<string, string[]> | undefined;
              if (policies) {
                route.policies.inbound = policies.inbound || [];
                route.policies.outbound = policies.outbound || [];
              }
              const handler = zuploRoute["handler"] as Record<string, unknown> | undefined;
              if (handler?.module) {
                const module = handler.module as string;
                if (module.includes("./modules/")) {
                  route.handler = module.replace("$import(./modules/", "").replace(")", "");
                } else if (module.includes("@zuplo/runtime")) {
                  route.handler = handler.export as string;
                }
              }
            }
            analysis.routes.push(route);
          }
        }
      }
    } catch (e) {
      console.error(`Error parsing routes for ${slug}:`, e);
    }
  }

  // Parse policies.json
  const policiesPath = path.join(exampleDir, "config", "policies.json");
  if (fs.existsSync(policiesPath)) {
    try {
      const policiesContent = fs.readFileSync(policiesPath, "utf-8");
      const policiesJson = JSON.parse(policiesContent);
      if (policiesJson.policies) {
        for (const policy of policiesJson.policies) {
          const policyInfo: PolicyInfo = {
            name: policy.name,
            policyType: policy.policyType,
            isCustom:
              policy.policyType === "custom-code-inbound" ||
              policy.policyType === "custom-code-outbound" ||
              (policy.handler?.module && policy.handler.module.includes("./modules/")),
          };
          analysis.policies.push(policyInfo);
        }
      }
    } catch (e) {
      console.error(`Error parsing policies for ${slug}:`, e);
    }
  }

  // List modules
  const modulesDir = path.join(exampleDir, "modules");
  if (fs.existsSync(modulesDir)) {
    const moduleFiles = fs.readdirSync(modulesDir);
    analysis.modules = moduleFiles
      .filter((f) => f.endsWith(".ts"))
      .map((f) => f.replace(".ts", ""));
  }

  return analysis;
}

function slugToTitle(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function extractDescriptionFromReadme(readmeContent?: string): string {
  if (!readmeContent) return "";
  // Try to extract the first paragraph after the title
  const lines = readmeContent.split("\n");
  let foundTitle = false;
  let description = "";
  for (const line of lines) {
    if (line.startsWith("# ")) {
      foundTitle = true;
      continue;
    }
    if (foundTitle && line.trim() && !line.startsWith("#") && !line.startsWith("```")) {
      description = line.trim();
      break;
    }
  }
  return description;
}

function generateClaudeMd(analysis: ExampleAnalysis, slug: string): string {
  const { metadata, routes, policies, modules, envVars, hasDocs, readmeContent } = analysis;
  const title = metadata?.title || slugToTitle(slug);
  const description = metadata?.description || extractDescriptionFromReadme(readmeContent) || "";

  let content = `# ${title}\n\n`;
  content += `${description}\n\n`;

  // Key Files section
  content += `## Key Files\n\n`;
  content += `| File | Purpose |\n`;
  content += `|------|--------|\n`;
  content += `| \`config/routes.oas.json\` | Route definitions with policies |\n`;

  if (policies.length > 0) {
    content += `| \`config/policies.json\` | Policy configurations |\n`;
  }

  for (const mod of modules) {
    // Try to determine what the module does
    let purpose = "Custom module";
    if (mod.includes("handler")) {
      purpose = "Request handler";
    } else if (mod.includes("inbound")) {
      purpose = "Inbound policy";
    } else if (mod.includes("outbound")) {
      purpose = "Outbound policy";
    } else if (mod.includes("rate-limit")) {
      purpose = "Rate limit configuration";
    }
    content += `| \`modules/${mod}.ts\` | ${purpose} |\n`;
  }

  if (hasDocs) {
    content += `| \`docs/\` | Zudoku documentation portal |\n`;
  }

  // Routes section
  if (routes.length > 0) {
    content += `\n## Routes\n\n`;
    content += `| Method | Path | Description |\n`;
    content += `|--------|------|-------------|\n`;
    for (const route of routes) {
      const desc = route.summary || route.operationId || "";
      content += `| ${route.method} | \`${route.path}\` | ${desc} |\n`;
    }
  }

  // Getting Started section
  content += `\n## Getting Started\n\n`;
  content += `**Create a local copy:**\n`;
  content += `\`\`\`bash\n`;
  content += `npx create-zuplo-api@latest --example ${slug}\n`;
  content += `\`\`\`\n\n`;
  content += `**Run locally:**\n`;
  content += `\`\`\`bash\n`;
  content += `npm install\n`;
  content += `npm run dev\n`;
  content += `# Server runs on https://localhost:9000\n`;
  content += `\`\`\`\n\n`;
  content += `**Deploy to Zuplo:**\n`;
  content += `\`\`\`bash\n`;
  content += `zuplo deploy\n`;
  content += `\`\`\`\n`;
  content += `Or use the [Deploy to Zuplo](https://zuplo.com/docs/examples/${slug}) button.\n`;

  // Test Commands section - generate curl examples for the routes
  if (routes.length > 0) {
    content += `\n## Test Commands\n\n`;
    content += `\`\`\`bash\n`;
    for (const route of routes.slice(0, 3)) {
      // Limit to first 3 routes
      if (route.method === "GET") {
        content += `# ${route.summary || route.operationId || route.path}\n`;
        content += `curl http://localhost:9000${route.path}\n\n`;
      } else if (route.method === "POST") {
        content += `# ${route.summary || route.operationId || route.path}\n`;
        content += `curl -X POST http://localhost:9000${route.path} \\\n`;
        content += `  -H "Content-Type: application/json" \\\n`;
        content += `  -d '{}'\n\n`;
      }
    }
    content += `\`\`\`\n`;
  }

  // Policies section
  if (policies.length > 0) {
    content += `\n## Policies Used\n\n`;
    for (const policy of policies) {
      const policyType = policy.isCustom ? "Custom" : "Built-in";
      content += `- **${policy.name}** (${policyType}): ${policy.policyType}\n`;
    }
  }

  // Environment Variables section
  if (envVars.length > 0) {
    content += `\n## Environment Variables\n\n`;
    content += `Set these in \`.env\` locally or in Zuplo Portal > Settings > Environment Variables:\n\n`;
    for (const envVar of envVars) {
      content += `- \`${envVar}\`\n`;
    }
  } else {
    content += `\n## Environment Variables\n\n`;
    content += `None required for this example.\n`;
  }

  // Related Docs section
  content += `\n## Related Docs\n\n`;

  // Add category-specific docs
  const categories = metadata?.categories || [];
  if (categories.includes("mcp")) {
    content += `- [MCP Server Documentation](https://zuplo.com/docs/mcp-server/introduction)\n`;
  }
  if (categories.includes("authentication") || categories.includes("authorization")) {
    content += `- [Authentication Policies](https://zuplo.com/docs/policies#authentication)\n`;
  }
  if (categories.includes("rate-limiting")) {
    content += `- [Rate Limiting Policy](https://zuplo.com/docs/policies/rate-limit-inbound)\n`;
  }
  if (categories.includes("caching")) {
    content += `- [Caching Policies](https://zuplo.com/docs/policies#caching)\n`;
  }
  if (categories.includes("validation")) {
    content += `- [Request Validation](https://zuplo.com/docs/policies/request-validation-inbound)\n`;
  }
  content += `- [Zuplo Documentation](https://zuplo.com/docs)\n`;
  content += `- [Policies Reference](https://zuplo.com/docs/policies)\n`;

  return content;
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const exampleIndex = args.indexOf("--example");
  const specificExample = exampleIndex !== -1 ? args[exampleIndex + 1] : null;

  const examplesJson = loadExamplesJson();
  const exampleDirs = getExampleDirs();

  // Create metadata map
  const metadataMap = new Map<string, ExampleMetadata>();
  for (const example of examplesJson.examples) {
    metadataMap.set(example.slug, example);
  }

  // Process examples
  const toProcess = specificExample
    ? [specificExample]
    : exampleDirs.filter((dir) => !SKIP_EXAMPLES.includes(dir));

  console.log(`Found ${exampleDirs.length} examples, processing ${toProcess.length}`);
  if (SKIP_EXAMPLES.length > 0) {
    console.log(`Skipping CLAUDE.md/AGENTS.md generation for: ${SKIP_EXAMPLES.join(", ")}`);
  }

  let generatedClaudeMd = 0;
  let generatedAgentsMd = 0;
  let generatedCursorRules = 0;
  let generatedCopilotInstructions = 0;
  let skipped = 0;

  for (const slug of toProcess) {
    const exampleDir = path.join(EXAMPLES_DIR, slug);
    const metadata = metadataMap.get(slug);
    const analysis = analyzeExample(slug, metadata);

    // Generate CLAUDE.md
    const claudeMdPath = path.join(exampleDir, "CLAUDE.md");
    if (fs.existsSync(claudeMdPath) && !specificExample) {
      console.log(`  Skipping ${slug}/CLAUDE.md (exists)`);
      skipped++;
    } else {
      const content = generateClaudeMd(analysis, slug);
      if (dryRun) {
        console.log(`\n--- ${slug}/CLAUDE.md ---`);
        console.log(content.slice(0, 500) + "...");
      } else {
        fs.writeFileSync(claudeMdPath, content);
        console.log(`  Generated ${slug}/CLAUDE.md`);
      }
      generatedClaudeMd++;
    }

    // Generate AGENTS.md (same content as CLAUDE.md)
    const agentsMdPath = path.join(exampleDir, "AGENTS.md");
    if (fs.existsSync(agentsMdPath) && !specificExample) {
      console.log(`  Skipping ${slug}/AGENTS.md (exists)`);
    } else {
      const content = generateClaudeMd(analysis, slug);
      if (dryRun) {
        console.log(`  Would generate ${slug}/AGENTS.md (same as CLAUDE.md)`);
      } else {
        fs.writeFileSync(agentsMdPath, content);
        console.log(`  Generated ${slug}/AGENTS.md`);
      }
      generatedAgentsMd++;
    }

    // Generate .cursorrules
    const cursorRulesPath = path.join(exampleDir, ".cursorrules");
    if (fs.existsSync(cursorRulesPath) && !specificExample) {
      console.log(`  Skipping ${slug}/.cursorrules (exists)`);
    } else {
      if (dryRun) {
        console.log(`  Would generate ${slug}/.cursorrules`);
      } else {
        fs.writeFileSync(cursorRulesPath, CURSORRULES_CONTENT);
        console.log(`  Generated ${slug}/.cursorrules`);
      }
      generatedCursorRules++;
    }

    // Generate .github/copilot-instructions.md
    const githubDir = path.join(exampleDir, ".github");
    const copilotPath = path.join(githubDir, "copilot-instructions.md");
    if (fs.existsSync(copilotPath) && !specificExample) {
      console.log(`  Skipping ${slug}/.github/copilot-instructions.md (exists)`);
    } else {
      if (dryRun) {
        console.log(`  Would generate ${slug}/.github/copilot-instructions.md`);
      } else {
        ensureDir(githubDir);
        fs.writeFileSync(copilotPath, COPILOT_INSTRUCTIONS_CONTENT);
        console.log(`  Generated ${slug}/.github/copilot-instructions.md`);
      }
      generatedCopilotInstructions++;
    }
  }

  // Also generate shared files for the hand-crafted examples (SKIP_EXAMPLES)
  // These have custom CLAUDE.md but still need .cursorrules and copilot-instructions
  for (const slug of SKIP_EXAMPLES) {
    const exampleDir = path.join(EXAMPLES_DIR, slug);
    if (!fs.existsSync(exampleDir)) continue;

    // Generate AGENTS.md (copy of existing CLAUDE.md)
    const claudeMdPath = path.join(exampleDir, "CLAUDE.md");
    const agentsMdPath = path.join(exampleDir, "AGENTS.md");
    if (fs.existsSync(claudeMdPath) && (!fs.existsSync(agentsMdPath) || specificExample)) {
      if (dryRun) {
        console.log(`  Would copy ${slug}/CLAUDE.md to AGENTS.md`);
      } else {
        const content = fs.readFileSync(claudeMdPath, "utf-8");
        fs.writeFileSync(agentsMdPath, content);
        console.log(`  Generated ${slug}/AGENTS.md (from CLAUDE.md)`);
      }
      generatedAgentsMd++;
    }

    // Generate .cursorrules
    const cursorRulesPath = path.join(exampleDir, ".cursorrules");
    if (!fs.existsSync(cursorRulesPath) || specificExample) {
      if (dryRun) {
        console.log(`  Would generate ${slug}/.cursorrules`);
      } else {
        fs.writeFileSync(cursorRulesPath, CURSORRULES_CONTENT);
        console.log(`  Generated ${slug}/.cursorrules`);
      }
      generatedCursorRules++;
    }

    // Generate .github/copilot-instructions.md
    const githubDir = path.join(exampleDir, ".github");
    const copilotPath = path.join(githubDir, "copilot-instructions.md");
    if (!fs.existsSync(copilotPath) || specificExample) {
      if (dryRun) {
        console.log(`  Would generate ${slug}/.github/copilot-instructions.md`);
      } else {
        ensureDir(githubDir);
        fs.writeFileSync(copilotPath, COPILOT_INSTRUCTIONS_CONTENT);
        console.log(`  Generated ${slug}/.github/copilot-instructions.md`);
      }
      generatedCopilotInstructions++;
    }
  }

  console.log(`\nDone:`);
  console.log(`  - CLAUDE.md: ${generatedClaudeMd} generated, ${skipped} skipped`);
  console.log(`  - AGENTS.md: ${generatedAgentsMd} generated`);
  console.log(`  - .cursorrules: ${generatedCursorRules} generated`);
  console.log(`  - .github/copilot-instructions.md: ${generatedCopilotInstructions} generated`);
}

main();
