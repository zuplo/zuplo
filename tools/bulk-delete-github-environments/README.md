# Bulk Delete Github Environments

This is a script that makes it easy to delete all environments in a Github repository.

## Usage

You will need to create a Github Personal Access Token with the `repo` scope and set it as the `GITHUB_ACCESS_TOKEN` environment variable. As of writing you cannot use Github fine-grained tokens.

Set the `GITHUB_ORG` and `GITHUB_REPO` environment variables to the organization and repository you want to delete environments from.

```bash
GITHUB_ACCESS_TOKEN=ghp_****** GITHUB_ORG=my-org GITHUB_REPO=my-repo \
npx bulk-delete-github-environments@latest
```
