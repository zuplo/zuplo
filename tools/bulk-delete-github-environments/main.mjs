#!/usr/bin/env -S node --no-warnings
import { Octokit } from "@octokit/core";
import dotenv from "dotenv";
import plimit from "p-limit";

dotenv.config();

const owner = process.env.GITHUB_ORG;
const repo = process.env.GITHUB_REPO;
const token = process.env.GITHUB_ACCESS_TOKEN;

const octokit = new Octokit({ auth: token });

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

const limit = plimit(10);

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

  await Promise.all(
    environments.data.environments.map((env) =>
      limit(() => {
        console.log(`Deleting environment ${env.name}...`);
        return octokit.request(
          "DELETE /repos/{owner}/{repo}/environments/{environment_name}",
          {
            owner,
            repo,
            environment_name: env.name,
            headers: {
              "X-GitHub-Api-Version": "2022-11-28",
            },
          },
        );
      }),
    ),
  );

  return environments.data.total_count > 100;
}

let moreEnvironments = true;
while (moreEnvironments) {
  moreEnvironments = await deleteEnvironments();
}
