# Zuplo

This is a monorepo containing a few public-facing projects for Zuplo.

## Requirements

- **Node.js 24 or greater.** The Zuplo CLI v7 requires it, and Zuplo cloud builds run
  Node 24. See [.tool-versions](./.tool-versions).

## Examples

[`examples/`](./examples) contains examples showing how to perform various tasks with
[Zuplo](https://zuplo.com). Each example is a standalone Zuplo project.

To create a local copy of any example:

```bash
npx create-zuplo-api@latest --example <example-name>
```

The index used by zuplo.com is [examples/examples.json](./examples/examples.json).

## Packages

[`packages/`](./packages) contains NodeJS packages that are published to NPM.

## Tools

[`tools/`](./tools) contains internal utilities used to maintain this repo and Zuplo's
infrastructure.
