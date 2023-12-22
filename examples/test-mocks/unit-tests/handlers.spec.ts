/// <reference types="node" />

import { ZuploRequest } from "@zuplo/runtime";
import assert from "assert";
import sinon from "sinon";
import { MockAgent, setGlobalDispatcher } from "undici";
import handler1 from "../modules/handler1";
import handler2 from "../modules/handler2";
import { context } from "./mocks";

const mockAgent = new MockAgent();
setGlobalDispatcher(mockAgent);

describe("Handler test", function () {
  const sandbox = sinon.createSandbox();

  beforeEach(function () {
    sandbox.spy(context);
  });

  afterEach(function () {
    sandbox.restore();
  });

  it("Calls the handler and validates the result", async function () {
    // Add a spy to the logger to test that it was called
    const contextSpy = sandbox.spy(context.log, "info");

    // Mock the ZuploRequest to return { hello: "world" } json
    const mockRequest = sandbox.createStubInstance(ZuploRequest, {
      json: sinon.stub(Promise.resolve({ hello: "world" })),
    });

    // Call the handler
    const response = await handler1(mockRequest, context);
    const result = await response.json();

    // Test that the logger spy was called
    assert(contextSpy.calledOnce);

    // Test that the response object is in the right shape
    assert(result.hello === "world");
  });

  it("Calls the handler and returns a response", async function () {
    const param1 = "hello";

    // Create a request, this isn't mocked
    const mockRequest = new ZuploRequest("https://my-api.zuplo.app", {
      params: {
        param1,
      },
    });

    // Use undici to mock the fetch that happens in the handler
    // See: https://github.com/nodejs/undici/blob/main/docs/api/MockAgent.md
    const mockPool = mockAgent.get(`https://echo.zuplo.io`);
    mockPool
      .intercept({ path: `/${param1}` })
      .reply(200, { data: "this is some data" });

    // Call the handler
    const result = await handler2(mockRequest, context);

    // Test that the response object is in the right shape
    assert(result.data === "this is some data");
  });
});
