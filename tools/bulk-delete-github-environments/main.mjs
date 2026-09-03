#!/usr/bin/env -S node --no-warnings
import { Octokit } from "@octokit/core";
import dotenv from "dotenv";
import plimit from "p-limit";

dotenv.config({ quiet: true });

const owner = process.env.GITHUB_ORG;
const repo = process.env.GITHUB_REPO;
const token = process.env.GITHUB_ACCESS_TOKEN;

if (!owner) {
  console.error("You must set the environment variable GITHUB_ORG.");
  process.exit(1);
}
if (!repo) {
  console.error("You must set the environment variable GITHUB_REPO.");
  process.exit(1);
}
if (!token) {
  console.error("You must set the environment variable GITHUB_ACCESS_TOKEN.");
  process.exit(1);
}

const octokit = new Octokit({ auth: token });

const limit = plimit(10);

const deleted = [];
const failed = [];

async function deleteEnvironments() {
  const environments = await octokit.request(
    "GET /repos/{owner}/{repo}/environments",
    {
      owner,
      repo,
      per_page: 100,
      headers: {
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  const names = environments.data.environments.map((env) => env.name);

  const results = await Promise.allSettled(
    names.map((name) =>
      limit(() => {
        console.log(`Deleting environment ${name}...`);
        return octokit.request(
          "DELETE /repos/{owner}/{repo}/environments/{environment_name}",
          {
            owner,
            repo,
            environment_name: name,
            headers: {
              "X-GitHub-Api-Version": "2022-11-28",
            },
          },
        );
      }),
    ),
  );

  let batchFailures = 0;
  results.forEach((result, index) => {
    const name = names[index];
    if (result.status === "fulfilled") {
      deleted.push(name);
    } else {
      batchFailures++;
      const error = result.reason;
      const status = error?.status ? `HTTP ${error.status}` : "error";
      failed.push({ name, message: `${status}: ${error?.message ?? error}` });
      console.error(`Failed to delete environment ${name} (${status}).`);
    }
  });

  // Stop paging if anything in this batch failed - the undeleted environments
  // would otherwise be re-listed forever.
  if (batchFailures > 0) {
    return false;
  }

  return environments.data.total_count > 100;
}

let moreEnvironments = true;
while (moreEnvironments) {
  moreEnvironments = await deleteEnvironments();
}

console.log(`\nDeleted ${deleted.length} environment(s).`);

if (failed.length > 0) {
  console.error(`Failed to delete ${failed.length} environment(s):`);
  for (const { name, message } of failed) {
    console.error(`  - ${name}: ${message}`);
  }
  process.exit(1);
}
