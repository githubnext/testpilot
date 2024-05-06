import path from "path";
import {
  APIFunction,
  FunctionDescriptor,
  Codex,
  TestGenerator,
  MochaValidator,
  BaseTestResultCollector,
} from "./";

(async () => {
  // FunctionDescriptor
  const functionDescriptor: FunctionDescriptor = {
    type: "function",
    signature: "(amount: number, unit: string)",
    isAsync: false,
    implementation: `
    // Pseudo-implementation for moment().add
  `,
    isConstructor: false,
    docComment:
      "Adds the specified amount of time to the moment object. The unit can be years, months, weeks, days, hours, minutes, seconds, or milliseconds. This function modifies the original moment object and returns it for chaining.",
  };

  const apiFunction = new APIFunction(
    "moment().add",
    functionDescriptor,
    "moment"
  );

  // LLM
  const model = new Codex(false, {
    n: 5,
    max_tokens: 150,
    temperature: 0.7,
  });

  // Validator + Collector
  const momentPath = path.join(require.resolve("moment"), "../");
  const validator = new MochaValidator("moment", momentPath);
  const collector = new BaseTestResultCollector();

  const temperatures = [0.7];
  const snippetMap = new Map([
    [
      apiFunction.functionName,
      ["moment().add(10, 'days')", "moment().add(1, 'year').format('YYYY')"],
    ],
  ]);

  // TestGenerator
  const generator = new TestGenerator(
    temperatures,
    (fn) => snippetMap.get(fn),
    model,
    validator,
    collector
  );

  // Generate the test
  console.log("Generating test for moment().format()");
  await generator.generateAndValidateTests(apiFunction);

  // Collect Results
  const testInfos = collector.getTestInfos();

  console.log("Test generation complete. Test Details:");
  testInfos.forEach((test) => {
    console.log(
      `Test ID: ${test.id}, Test Name: ${test.testName}, Outcome: ${test.outcome.status}`
    );
  });
})();
