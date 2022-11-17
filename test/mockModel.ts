import { expect } from "chai";
import { MockCompletionModel } from "../src/mockModel";

describe("test MockCompletionModel", () => {
  it("should be able to add and get completions", async () => {
    const model = new MockCompletionModel(true);
    model.addCompletions("foo", 0.5, ["bar", "baz"]);
    expect(await model.completions("foo", 0.5)).to.deep.equal(
      new Set(["bar", "baz"])
    );
  });

  it("should throw an error if completions are not found", async () => {
    const model = new MockCompletionModel(true);
    try {
      await model.completions("foo", 0.5);
      expect.fail();
    } catch (e: any) {
      expect(e.message).to.equal("Prompt not found at temperature 0.5: foo");
    }
  });

  it("should not throw an error if completions are not found and strictResponses is false", async () => {
    const model = new MockCompletionModel(false);
    expect(await model.completions("foo", 0.5)).to.deep.equal(new Set());
  });
});
