# Set Zuplo Route Config

This script sets the `x-zuplo-route` configuration on every route in the specified OpenAPI files.

## Usage

```bash
node main.mjs
```

## Configuration

Set the `openApiFiles` variable in `main.mjs` to the paths of the OpenAPI files you want to update.

Then, set the `zuploRouteConfig` variable to the desired route config. This will match what you want the `x-zuplo-route` to be set to.
