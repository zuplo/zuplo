# Include Custom Modules

This sample demonstrates how to bundle custom node modules to use in your Zuplo project.

## 1/ Install & Bundle the Module

In the `./third-party` folder run `npm install YOUR_MODULE` for the module you want to use.

Run the bundle script:

```bash
npm run bundle
```

This will bundle the module and save it to your project in `./modules/third-party/YOUR_MODULE/index.js`

## 2/ Type Definitions

By default this script will not copy or generate any type definition files. This means your custom module will be used as any `any` object and you wont have code completion.

If you want to bundle the type definitions (`*.d.ts`) files, we recommend copying them manually to the output directory - i.e. `./modules/third-party/YOUR_MODULE/index.d.ts`

There are some tools to do this automatically but we have found these to be problematic.

## 3/ Use the Module

Inside of your code you can now import the custom module through the path.

```ts
import MyModule from "./third-party/my-module";
```
