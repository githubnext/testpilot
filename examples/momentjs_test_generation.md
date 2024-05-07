# Example: Test Generation for Moment.js Function

This example demonstrates the process of generating tests for the **`moment().add`** function in Moment.js using a custom test generation framework.

## **Importing Dependencies**

```typescript
import path from "path";
import {
  APIFunction,
  FunctionDescriptor,
  Codex,
  TestGenerator,
  MochaValidator,
  BaseTestResultCollector,
} from "./";
```

Imports necessary libraries and modules, including the test generation and validation classes.

## **Defining the Function Descriptor**

```typescript
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
```

Describes the function being tested, including its signature and a brief documentation.

## **Initializing the Test Generator Components**

```typescript
const apiFunction = new APIFunction("moment().add", functionDescriptor, "moment");
const model = new Codex(false, {
  n: 5,
  max_tokens: 150,
  temperature: 0.7,
});
const momentPath = path.join(require.resolve("moment"), "../");
const validator = new MochaValidator("moment", momentPath);
const collector = new BaseTestResultCollector();
const temperatures = [0.7];
const snippetMap = new Map([
  [apiFunction.functionName, ["moment().add(10, 'days')", "moment().add(1, 'year').format('YYYY')"]],
]);
const generator = new TestGenerator(temperatures, (fn) => snippetMap.get(fn), model, validator, collector);
```

Initializes the object that makes prompts to the Codex-based completion API, and sets up paths and validators for test generation. Used `https://api.openai.com/v1/engines/gpt-3.5-turbo-instruct/completions`.

## **Test Generation and Collection**

```tsx
console.log("Generating test for moment().format()");
await generator.generateAndValidateTests(apiFunction);
const testInfos = collector.getTestInfos();
console.log("Test generation complete. Test Details:");
testInfos.forEach((test) => {
  console.log(`Test ID: ${test.id}, Test Name: ${test.testName}, Outcome: ${test.outcome.status}`);
});

```

Generates tests and logs the results to the console.

## **Note on Test File Management**

By default, the test files are temporarily stored in the **`node_modules/<library>/`** directory and are erased after testing. To change this behavior and save the test files, you can implement custom versions of the **`MochaValidator`** to a file saving version as shown below:

```typescript
class CustomMochaValidator extends MochaValidator {
  constructor(packageName, packagePath, testDirectory) {
    super(packageName, packagePath);
    this.testDirectory = testDirectory; // Custom directory for saving test files
    // Ensure the directory exists
    if (!fs.existsSync(this.testDirectory)) {
      fs.mkdirSync(this.testDirectory, { recursive: true });
    }
  }

  validateTest(testName, testSource) {
    let testFile = path.join(this.testDirectory, testName + '.js');
    fs.writeFileSync(testFile, testSource);
    console.log(`Test saved to: ${testFile}`); // Log where the test is saved
    // Call original validateTest logic here if needed, or simulate a test outcome
    return { status: 'PASSED' }; // Simulate a passed test outcome
  }

  // Override the cleanup to prevent deletion
  cleanup() {
    console.log('Cleanup skipped, tests preserved.');
  }
}
```

> OBS: The `CustomMochaValidator` implementation above is just an idea. It was not tested, unlike the code before.

## Running the script

The code shown in this example is at `/examples/testGenerationScript.ts`, but it will not run by default. To run the test generation script follow the below steps:

1. Copy `testGenerationScript.ts` to `src/`, making sure that the second import directory is `./`

    ```sh
    cp examples/testGenerationScript.ts src/
    ```

2. Install Moment.js with `npm`

    ```sh
    npm install moment
    ```

3. Build the files again

    ```sh
    npm run build
    ```

4. Finally, set the environment variables and run the script with `node`:

    ```sh
    export TESTPILOT_LLM_API_ENDPOINT='https://api.openai.com/v1/engines/gpt-3.5-turbo-instruct/completions'
    export TESTPILOT_LLM_AUTH_HEADERS='{"Authorization": "Bearer <your API key>", "OpenAI-Organization": "<your organization ID>"}'
    node dist/testGenerationScript.js
    ```
