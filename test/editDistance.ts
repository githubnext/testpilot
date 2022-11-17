import { expect } from "chai";
import dedent from "dedent";
import deepEqualInAnyOrder from "deep-equal-in-any-order";
import { parseTests } from "../benchmark/editDistance";

const chai = require("chai");
chai.use(deepEqualInAnyOrder);

const testFileName = "testFileName.js";
/**
 * helper function to create expected tests from an array of input tests
 * @param tests
 * @param testFileName
 * @returns Set of Test objects
 */
function createExpectedTests(tests: string[], testFileName: string) {
  const expectedTests = new Set();

  //add tests to expectedTests with index and fileName
  tests.forEach(function (test, index) {
    expectedTests.add({
      fileName: testFileName,
      index: index,
      contents: dedent(test),
    });
  });
  return expectedTests;
}

function creatTestFileContent(tests: string[]) {
  return tests
    .map(function (test) {
      return dedent(test);
    })
    .join("\n\n");
}

function setupAndExecuteTest(tests: string[]) {
  const testFileContent = creatTestFileContent(tests);

  const expectedTests = createExpectedTests(tests, testFileName);
  const extractedTests = parseTests(testFileName, testFileContent);

  expect(expectedTests).to.deep.equal(extractedTests);
}

describe("editDistance parseTests", () => {
  it("should detect multiple tests", () => {
    const tests = [
      'it("should eat its own dog food", function () {\n\n    var a = Complex(1, -5).toString();\n}) ',
      "it('test case', function(done) {\n        let complex = complex_js.ZERO.asin();\n})",
    ];

    setupAndExecuteTest(tests);
  });

  it("should handle { or ) in it description", () => {
    const tests = [
      "it(\"sends { index, value } progress updates\", function () {\n var test = '';})",
      "it( 'sends ) index, value } progress updates', function () {\n var test = '';})",
      "it('sends ( index, value } progress updates', function () {\n var test = '';})",
      "it('sends } index, value } progress updates', function () {\n var test = '';})",
    ];

    setupAndExecuteTest(tests);
  });

  it("should detect arrow functions", () => {
    const tests = [
      dedent`
        it('my test', () => {
          // should set the timeout of this test to 1000 ms; instead will fail
          this.timeout(1000);
          assert.ok(true);
        })`,
    ];

    setupAndExecuteTest(tests);
  });

  it("should not match split", () => {
    const tests = [
      dedent`
        split('my test', () => {
          // should set the timeout of this test to 1000 ms; instead will fail
          this.timeout(1000);
          assert.ok(true);
        })`,
    ];

    const testFileContent = creatTestFileContent(tests);
    const extractedTests = parseTests(testFileName, testFileContent);
    expect(extractedTests.size).equal(0);
  });

  it("should handle malformed tests", () => {
    const tests = [
      dedent`
        it('my test', () => ()`,
    ];

    const testFileContent = creatTestFileContent(tests);
    const extractedTests = parseTests(testFileName, testFileContent);
    expect(extractedTests.size).equal(0);
  });

  it("should detect jtests", () => {
    const tests = [
      "test('HashSet hash function test', () => { new HashMap(arr.map(x => [Math.floor(Number(x)), 1]));)}",
    ];
    setupAndExecuteTest(tests);
  });
});
