# Include Custom Modules

This sample demonstrates how to bundle custom node modules to use in your Zuplo project. In order to use this in your own Zuplo project, you must connect to source control and clone your project locally.

## 1/ Install Your Custom Module

First, install your custom module into your project:

```bash
npm install YOUR_MODULE
```

## 2/ Bundle the Module

Bundle the module using [tsdown](https://tsdown.dev/). You can use other bundling tools as well, but tsdown is simple and effective for this purpose.

```bash
npx tsdown ./node_modules/YOUR_MODULE --format esm --platform browser --out-dir ./modules/third-party/YOUR_MODULE
```

For convenience, add this as a script in your `package.json`:

```json
{
  "scripts": {
    "bundle": "npx tsdown ./node_modules/YOUR_MODULE --format esm --platform browser --out-dir ./modules/third-party/YOUR_MODULE"
  }
}
```

Then run:

```bash
npm run bundle
```

## 3/ Use the Module

Inside of your code you can now import the custom module through the path. One thing to note is that you will not have code completion for this module. See the next step for information on how to include type definitions.

```ts
import MyModule from "./third-party/my-module";
```

## 4/ Optional: Type Definitions

By default this script will not copy or generate any type definition files. This means your custom module will be used as any `any` object and you wont have code completion.

If you want to bundle the type definitions (`*.d.ts`) files, we recommend copying them manually to the output directory - i.e. `./modules/third-party/YOUR_MODULE/index.d.ts`

## Updating the Bundle

If you would like to update your custom module, you will need to first install the new module version. You can install the latest version of a module by running `npm install YOUR_MODULE@latest`, then re-run the `npm run bundle` command. This will overwrite the existing bundle with the new version of the module.

## Use this example locally

To develop with this example locally, you can create a new Zuplo project using our CLI

```bash
npx create-zuplo-api@latest my-api --example custom-module
```

Then, in the project directory run the following commands:

```bash
npm install
npm run bundle
npm run dev
```
