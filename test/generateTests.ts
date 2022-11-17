import { expect } from "chai";
import { emptyCoverageSummary } from "../src/coverage";
import { APIFunction } from "../src/exploreAPI";
import { TestGenerator } from "../src/generateTests";
import { MockCompletionModel } from "../src/mockModel";
import {
  defaultPromptOptions,
  Prompt,
  RetryPrompt,
} from "../src/promptCrafting";
import { ITestInfo, TestOutcome } from "../src/report";
import {
  BaseTestResultCollector,
  IPromptInfo,
} from "../src/testResultCollector";
import { TestValidator } from "../src/testValidator";

/**
 * A mock test validator that validates tests as passing/failing based on a
 * given list of passing tests.
 */
class MockValidator extends TestValidator {
  private passingTests: Set<string> = new Set();

  public addPassingTest(test: string) {
    this.passingTests.add(test);
  }

  public validateTest(testName: string, testSource: string): TestOutcome {
    expect(testSource).to.not.be.undefined;
    if (this.passingTests.has(testName)) {
      return { status: "PASSED" };
    } else if (testSource.trim() === "this isn't a valid completion") {
      return { status: "FAILED", err: { message: "Invalid syntax" } };
    } else {
      return { status: "FAILED", err: { message: "test failed" } };
    }
  }

  public computeCoverageSummary() {
    return emptyCoverageSummary();
  }
}

describe("TestGenerator", () => {
  /**
   * Test a simple test-generation scenario: for `fun` with snippets
   * `snippets`, we specify which completions the model supposedly returns for
   * each prompt, and we specify which tests are expected to pass.
   */
  async function runSimpleTest(
    fun: APIFunction,
    snippets: string[],
    prompts: {
      prompt: Prompt;
      tests: { completion: string; passes: boolean }[];
    }[]
  ) {
    const model = new MockCompletionModel(true);
    const validator = new MockValidator();
    const collector = new BaseTestResultCollector();
    const snippetMap = new Map<string, string[]>();
    snippetMap.set(fun.functionName, snippets);
    const testGenerator = new TestGenerator(
      [0.0],
      Map.prototype.get.bind(snippetMap),
      model,
      validator,
      collector
    );

    const expectedPromptInfos: IPromptInfo[] = [];
    const expectedTestInfos: ITestInfo[] = [];

    let promptCounter = 0,
      testCounter = 0;
    let testInfos: Map<string, ITestInfo> = new Map();
    for (const { prompt, tests } of prompts) {
      const id = promptCounter++;
      const temperature = 0.0;
      const completions = tests.map((t) => t.completion);
      model.addCompletions(prompt.assemble(), temperature, completions);
      expectedPromptInfos.push({
        id,
        prompt,
        temperature,
        file: `prompt_${id}.js`,
        completions: new Set(completions),
      });

      for (const { completion, passes } of tests) {
        const testSource = prompt.completeTest(completion) ?? completion;
        let testInfo = testInfos.get(testSource);
        if (!testInfo) {
          const id = testCounter++;
          const testName = `test_${id}.js`;
          if (passes) {
            validator.addPassingTest(testName);
          }
          testInfo = {
            id,
            api: fun.accessPath,
            outcome: validator.validateTest(testName, testSource),
            prompts: [prompt],
            testName,
            testSource,
          };
          testInfos.set(testSource, testInfo);
          expectedTestInfos.push(testInfo);
        } else {
          testInfo.prompts.push(prompt);
        }
      }
    }

    await testGenerator.generateAndValidateTests(fun);

    expect(collector.getPromptInfos()).to.deep.equal(expectedPromptInfos);
    expect(collector.getTestInfos()).to.deep.equal(expectedTestInfos);
  }

  it("should handle the straightforward case with a single prompt and a single completion", async () => {
    const fun = APIFunction.fromSignature("string-utils.titleCase(string)");
    const cmp =
      "    assert(stringUtils.titleCase('hello world') === 'Hello World');";
    await runSimpleTest(
      fun,
      [],
      [
        {
          prompt: new Prompt(fun, [], defaultPromptOptions()),
          tests: [{ completion: cmp, passes: true }],
        },
      ]
    );
  });

  it("should handle a case with a single prompt and multiple completions", async () => {
    const fun = APIFunction.fromSignature("string-utils.titleCase(string)");
    const cmp1 =
      "    assert(stringUtils.titleCase('hello world') === 'Hello World');";
    const cmp2 =
      "    assert(stringUtils.titleCase('Hello World') === 'Hello world');";
    const initialPrompt = new Prompt(fun, [], defaultPromptOptions());
    const provenance = {
      originalPrompt: initialPrompt,
      testId: 1,
      refiner: "RetryWithError",
    };
    const refinedPrompt = new RetryPrompt(
      initialPrompt,
      cmp2,
      "test failed"
    ).withProvenance(provenance);
    await runSimpleTest(
      fun,
      [],
      [
        {
          prompt: initialPrompt,
          tests: [
            { completion: cmp1, passes: true },
            { completion: cmp2, passes: false },
          ],
        },
        {
          prompt: refinedPrompt,
          tests: [],
        },
      ]
    );
  });

  it("should handle a case with multiple prompts that yield different completions", async () => {
    // a scenario where the model gets the test wrong without snippets, but gets it right with snippets
    const fun = APIFunction.fromSignature("string-utils.titleCase(string)");
    const snippet = "stringUtils.titleCase('hello world').result";
    const cmp1 =
      "    assert(stringUtils.titleCase('hello world').result === 'Hello World');";
    const cmp2 =
      "    assert(stringUtils.titleCase('hello world') === 'Hello World');";
    const initialPrompt = new Prompt(fun, [snippet], defaultPromptOptions());
    const provenance = {
      originalPrompt: initialPrompt,
      testId: 0,
      refiner: "SnippetIncluder",
    };
    const refinedPrompt = new Prompt(fun, [snippet], {
      ...defaultPromptOptions(),
      includeSnippets: true,
    }).withProvenance(provenance);
    const provenance2 = {
      originalPrompt: refinedPrompt,
      testId: 1,
      refiner: "RetryWithError",
    };
    const refinedPrompt2 = new RetryPrompt(
      refinedPrompt,
      cmp2,
      "test failed"
    ).withProvenance(provenance2);
    await runSimpleTest(
      fun,
      [snippet],
      [
        {
          prompt: initialPrompt,
          tests: [{ completion: cmp1, passes: true }],
        },
        {
          prompt: refinedPrompt,
          tests: [{ completion: cmp2, passes: false }],
        },
        {
          prompt: refinedPrompt2,
          tests: [],
        },
      ]
    );
  });

  it("should handle a case with multiple prompts and that yield the same completions", async () => {
    const fun = APIFunction.fromSignature("string-utils.titleCase(string)");
    const snippet = "stringUtils.titleCase('hello world')";
    const cmp =
      "    assert(stringUtils.titleCase('hello world') === 'Hello World');";
    const initialPrompt = new Prompt(fun, [snippet], defaultPromptOptions());
    const provenance = {
      originalPrompt: initialPrompt,
      testId: 0,
      refiner: "SnippetIncluder",
    };
    const refinedPrompt = new Prompt(fun, [snippet], {
      ...defaultPromptOptions(),
      includeSnippets: true,
    }).withProvenance(provenance);
    await runSimpleTest(
      fun,
      [snippet],
      [
        {
          prompt: initialPrompt,
          tests: [{ completion: cmp, passes: true }],
        },
        {
          prompt: refinedPrompt,
          tests: [{ completion: cmp, passes: true }],
        },
      ]
    );
  });

  it("should handle a case where multiple refinements yield the same prompt", async () => {
    const fun = APIFunction.fromSignature("string-utils.titleCase(string)");
    const snippet =
      "console.log(stringUtils.titleCase('hello world')) // 'Hello World'";
    const cmp1 =
      "    assert(stringUtils.titleCase('hello world') === 'Hello World');";
    const cmp2 =
      "    assert(stringUtils.titleCase('Hello world') === 'Hello World');";
    const initialPrompt = new Prompt(fun, [snippet], defaultPromptOptions());
    const provenance1 = {
      originalPrompt: initialPrompt,
      testId: 1,
      refiner: "SnippetIncluder",
    };
    const provenance2 = {
      originalPrompt: initialPrompt,
      testId: 0,
      refiner: "SnippetIncluder",
    };
    // we get the same refined prompt for both completions
    const refinedPrompt = new Prompt(fun, [snippet], {
      ...defaultPromptOptions(),
      includeSnippets: true,
    }).withProvenance(provenance1, provenance2);
    await runSimpleTest(
      fun,
      [snippet],
      [
        {
          prompt: initialPrompt,
          tests: [
            { completion: cmp1, passes: true },
            { completion: cmp2, passes: true },
          ],
        },
        {
          prompt: refinedPrompt,
          tests: [],
        },
      ]
    );
  });

  it("should not stop refining when encountering a syntax error", async () => {
    const fun = APIFunction.fromSignature("string-utils.titleCase(string)");
    const snippet = "stringUtils.titleCase('hello world')";

    // pretend we get an invalid completion when running without snippets
    const initialPrompt = new Prompt(fun, [snippet], defaultPromptOptions());
    const invalidCmp = "    this isn't a valid completion";

    // but we get a valid completion when including snippets
    const provenance = {
      originalPrompt: initialPrompt,
      testId: 0,
      refiner: "SnippetIncluder",
    };
    const refinedPrompt = new Prompt(fun, [snippet], {
      ...defaultPromptOptions(),
      includeSnippets: true,
    }).withProvenance(provenance);
    const validCmp =
      "    assert(stringUtils.titleCase('hello world') === 'Hello World');";

    // and of course we also get a retry prompt
    const provenance2 = {
      originalPrompt: initialPrompt,
      testId: 0,
      refiner: "RetryWithError",
    };
    const retryPrompt = new RetryPrompt(
      initialPrompt,
      invalidCmp,
      "Invalid syntax"
    ).withProvenance(provenance2);

    await runSimpleTest(
      fun,
      [snippet],
      [
        {
          prompt: initialPrompt,
          tests: [{ completion: invalidCmp, passes: false }],
        },
        {
          prompt: retryPrompt,
          tests: [],
        },
        {
          prompt: refinedPrompt,
          tests: [{ completion: validCmp, passes: true }],
        },
      ]
    );
  });
});

describe("Test validation", () => {
  it("should reject an empty test", async () => {
    const model = new MockCompletionModel(true);
    const validator = new MockValidator();
    const collector = new BaseTestResultCollector();
    const snippetMap = new Map<string, string[]>();
    const testGenerator = new TestGenerator(
      [0.0],
      Map.prototype.get.bind(snippetMap),
      model,
      validator,
      collector
    );
    const fun = APIFunction.fromSignature("string-utils.titleCase(string)");
    const prompt = new Prompt(fun, [], defaultPromptOptions());
    const info = testGenerator.validateCompletion(prompt, "", 0);
    expect(info.outcome).to.deep.equal(
      TestOutcome.FAILED({ message: "Empty test" })
    );
  });
});
