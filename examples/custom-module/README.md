# Include Custom Modules

This sample demonstrates how to bundle custom node modules to use in your Zuplo project. In order to use this in your own Zuplo project, you must connect to source control and clone your project locally.

## 1/ Setup the Bundler

First, you need to install the `esbuild` module. This is the tool that will actually create your custom bundle. You will install this as a dev dependency.

```
npm install esbuild -D
```

## 2/ Create the Bundle Script

You will need a script that configures and runs the `esbuild` bundler. This script will be run every time you want to bundle your custom modules. You can copy the script from the [`bundle.mjs`](./bundle.mjs) file in this example.

## 3/ Install Your Custom Module

Next, you will install your custom module into your project. You can do this by running `npm install YOUR_MODULE`. This will install the module into your `node_modules` directory.

## 4/ Bundle the Module(s)

In order to bundle your custom modules, you will run the script you create in step 2. This will create a `./modules/third-party` directory in your project with the bundled modules.

```
npm run bundle
```

## 5/ Use the Module

Inside of your code you can now import the custom module through the path. One thing to note is that you will not have code completion for this module. See the next step for information on how to include type definitions.

```ts
import MyModule from "./third-party/my-module";
```

## 6/ Optional: Type Definitions

By default this script will not copy or generate any type definition files. This means your custom module will be used as any `any` object and you wont have code completion.

If you want to bundle the type definitions (`*.d.ts`) files, we recommend copying them manually to the output directory - i.e. `./modules/third-party/YOUR_MODULE/index.d.ts`

There are some tools to do this automatically but we have found these to be problematic.

## Updating the Bundle

If you would like to update your custom module, you will need to first install the new module version. You can install the latest version of a module by running `npm install YOUR_MODULE@latest`, then re-run the `npm run bundle` command. This will overwrite the existing bundle with the new version of the module.
