import { RuntimeExtensions, JwtServicePlugin } from "@zuplo/runtime";

export function runtimeInit(runtime: RuntimeExtensions) {
  // Add the JwtServicePlugin to the runtime
  const jwtService = new JwtServicePlugin();
  runtime.addPlugin(jwtService);
}
