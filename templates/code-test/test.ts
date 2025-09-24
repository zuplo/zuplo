import { describe, it, TestHelper } from "@zuplo/test";
import { expect } from "chai";

// Visit https://zuplo.com/docs/guides/custom-ci-cd for more information on how to write and run tests

describe("{{description}}", () => {
  it("should have a body", async () => {
    const response = await fetch(TestHelper.TEST_URL);
    const result = await response.text();
    expect(result).to.equal(JSON.stringify("What zup?"));
  });
});