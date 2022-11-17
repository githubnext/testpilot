import { expect } from "chai";
import dedent from "dedent";
import { APIFunction } from "../src/exploreAPI";
import {
  Prompt,
  RetryPrompt,
  RetryWithError,
  SnippetIncluder,
  DocCommentIncluder,
  FunctionBodyIncluder,
  defaultPromptOptions,
} from "../src/promptCrafting";
import { TestOutcome } from "../src/report";

describe("test DocCommentIncluder", () => {
  const docCommentIncluder = new DocCommentIncluder();

  it("refining a prompt without doc comments should yield one with", () => {
    const fun = APIFunction.fromSignature("plural.addRule(match, result)");
    fun.descriptor.docComment = "'*\n* adds rule \n* @param {string}'";

    const prompt = new Prompt(fun, [], defaultPromptOptions());
    const refined = docCommentIncluder.refine(prompt, "", TestOutcome.PASSED());
    expect(refined).to.deep.equal([
      new Prompt(fun, [], {
        ...defaultPromptOptions(),
        includeDocComment: true,
      }),
    ]);
  });

  it("refining a prompt with doc comments should not do anything", () => {
    const fun = APIFunction.fromSignature(
      "zip-a-folder.ZipAFolder.tar(srcFolder, tarFilePath, zipAFolderOptions) async"
    );
    fun.descriptor.docComment = "doc string";
    const prompt = new Prompt(fun, [], {
      ...defaultPromptOptions(),
      includeDocComment: true,
    });
    const refined = docCommentIncluder.refine(prompt, "", TestOutcome.PASSED());
    expect(refined).to.deep.equal([]);
  });

  it("refining a prompt with usage snippets and without doc comments should yield one with doc comments", () => {
    const fun = APIFunction.fromSignature("plural.addRule(match, result)");
    fun.descriptor.docComment = "doc string";
    const usageSnippets = [
      dedent`
                // usage #1
                // plural.addRule("goose", "geese");
                `,
      dedent`
                // usage #2
                // function neuterPlural(word) {
                //   return word.replace(/um$/, 'a');
                // }
                // plural.addRule('bacterium', neuterPlural);
                // plural.addRule('memorandum', neuterPlural);
                `,
    ];
    const prompt = new Prompt(fun, usageSnippets, {
      ...defaultPromptOptions(),
      includeDocComment: false,
    });
    const refined = docCommentIncluder.refine(prompt, "", TestOutcome.PASSED());
    expect(refined).to.deep.equal([
      new Prompt(fun, usageSnippets, {
        ...defaultPromptOptions(),
        includeDocComment: true,
      }),
    ]);
  });

  it("refining a prompt that did not include doc comments but has none should do nothing", () => {
    const fun = APIFunction.fromSignature("plural.addRule(match, result)");

    const prompt = new Prompt(fun, [], defaultPromptOptions());
    const refined = docCommentIncluder.refine(prompt, "", TestOutcome.PASSED());
    expect(refined).to.deep.equal([]);
  });
});

describe("test SnippetIncluder", () => {
  const snippetIncluder = new SnippetIncluder();

  it("refining a prompt without usage snippets should add them", () => {
    const fun = APIFunction.fromSignature("plural.addRule(match, result)");
    fun.descriptor.docComment = "Add a rule for forming the plural of a word.";
    const snippets = [
      dedent`
            // usage #1
            // plural.addRule("goose", "geese");
            `,
      dedent`
            // usage #2
            // function neuterPlural(word) {
            //   return word.replace(/um$/, 'a');
            // }
            // plural.addRule('bacterium', neuterPlural);
            // plural.addRule('memorandum', neuterPlural);
            `,
    ];
    const prompt = new Prompt(fun, snippets, {
      ...defaultPromptOptions(),
      includeDocComment: true,
    });
    const refined = snippetIncluder.refine(prompt, "", TestOutcome.PASSED());
    expect(refined).to.deep.equal([
      new Prompt(fun, snippets, {
        ...defaultPromptOptions(),
        includeSnippets: true,
        includeDocComment: true,
      }),
    ]);
  });

  it("refining a prompt where there are no usage snippets should not do anything", () => {
    const fun = APIFunction.fromSignature(
      "zip-a-folder.ZipAFolder.tar(srcFolder, tarFilePath, zipAFolderOptions) async"
    );
    const prompt = new Prompt(fun, [], defaultPromptOptions());
    const refined = snippetIncluder.refine(prompt, "", TestOutcome.PASSED());
    expect(refined).to.deep.equal([]);
  });
});

describe("retry-with-error refiner", () => {
  const retryWithErrorRefiner = new RetryWithError();

  it("refining a prompt after a failed test should include the error message", () => {
    const fun = APIFunction.fromSignature("plus(x, y)");
    fun.descriptor.docComment = "Concatenates two strings.";
    const prompt = new Prompt(fun, [], {
      ...defaultPromptOptions(),
      includeDocComment: true,
    });

    // first, a failed test
    const completion = " ".repeat(8) + "assert(plus(1, 1), 3);";
    expect(prompt.completeTest(completion)).to.equal(dedent`
            let mocha = require('mocha');
            let assert = require('assert');
            let plus = require('plus');
            describe('test suite', function() {
                it('test case', function(done) {
                    assert(plus(1, 1), 3);
                })
            })
        `);

    // then, a retry
    const errmsg = "expected 2 to equal 3";
    const refined = retryWithErrorRefiner.refine(
      prompt,
      completion,
      TestOutcome.FAILED({ message: errmsg })
    );
    const refinedPrompt = new RetryPrompt(prompt, completion, errmsg);
    expect(refined).to.deep.equal([refinedPrompt]);
    expect(refinedPrompt.assemble()).to.equal(
      dedent`
            let mocha = require('mocha');
            let assert = require('assert');
            let plus = require('plus');
            // Concatenates two strings.
            // plus(x, y)
            describe('test plus', function() {
                it('test plus', function(done) {
                    assert(plus(1, 1), 3);
                })
                // the test above fails with the following error:
                //   expected 2 to equal 3
                // fixed test:
                it('test plus', function(done) {
        ` + "\n"
    );
  });
});

describe("function-body inclusion", () => {
  const functionBodyIncluder = new FunctionBodyIncluder();

  it("refining a prompt should include the function body", () => {
    const fun = APIFunction.fromSignature(
      "plus(x, y)",
      dedent`
                function plus(x, y) {
                    return String(x) + String(y);
                }
            `
    );

    // initial prompt
    const prompt = new Prompt(fun, [], defaultPromptOptions());
    expect(prompt.assemble()).to.equal(
      dedent`
            let mocha = require('mocha');
            let assert = require('assert');
            let plus = require('plus');
            // plus(x, y)
            describe('test plus', function() {
                it('test plus', function(done) {
        ` + "\n"
    );

    // refined prompt
    const refined = functionBodyIncluder.refine(
      prompt,
      "",
      TestOutcome.PASSED()
    );
    expect(refined).to.have.lengthOf(1);
    const refinedPrompt = refined[0];
    expect(refinedPrompt.assemble()).to.equal(
      dedent`
            let mocha = require('mocha');
            let assert = require('assert');
            let plus = require('plus');
            // plus(x, y)
            // function plus(x, y) {
            //     return String(x) + String(y);
            // }
            describe('test plus', function() {
                it('test plus', function(done) {
        ` + "\n"
    );
  });

  it("refining a prompt where no function body is available should do nothing", () => {
    const fun = APIFunction.fromSignature("plural.addRule(match, result)");

    const prompt = new Prompt(fun, [], defaultPromptOptions());
    const refined = functionBodyIncluder.refine(
      prompt,
      "",
      TestOutcome.PASSED()
    );
    expect(refined).to.deep.equal([]);
  });
});

describe("test prompt assembly", () => {
  it("should assemble a prompt without snippets", () => {
    const fun = APIFunction.fromSignature(
      "zip-a-folder.ZipAFolder.tar(srcFolder, tarFilePath, zipAFolderOptions) async"
    );
    const prompt = new Prompt(fun, [], defaultPromptOptions());

    const expectedPrompt = dedent`
            let mocha = require('mocha');
            let assert = require('assert');
            let zip_a_folder = require('zip-a-folder');
            // zip-a-folder.ZipAFolder.tar(srcFolder, tarFilePath, zipAFolderOptions) async
            describe('test zip_a_folder', function() {
                it('test zip-a-folder.ZipAFolder.tar', function(done) {\n
        `;

    expect(prompt.assemble()).to.equal(expectedPrompt);
  });

  it("should assemble a prompt with doc comments and without snippets", () => {
    const fun = APIFunction.fromSignature(
      "zip-a-folder.ZipAFolder.tar(srcFolder, tarFilePath, zipAFolderOptions) async"
    );
    fun.descriptor.docComment = "*\n* zips folder \n* @param {string}";
    const prompt = new Prompt(fun, [], {
      ...defaultPromptOptions(),
      includeDocComment: true,
    });

    const expectedPrompt = dedent`
            let mocha = require('mocha');
            let assert = require('assert');
            let zip_a_folder = require('zip-a-folder');
            // zips folder
            // @param {string}
            // zip-a-folder.ZipAFolder.tar(srcFolder, tarFilePath, zipAFolderOptions) async
            describe('test zip_a_folder', function() {
                it('test zip-a-folder.ZipAFolder.tar', function(done) {\n
        `;

    expect(prompt.assemble()).to.equal(expectedPrompt);
  });

  it("should assemble a prompt with snippets", () => {
    const fun = APIFunction.fromSignature("plural.addRule(match, result)");
    const prompt = new Prompt(
      fun,
      [
        dedent`
                plural.addRule("goose", "geese");`,
        dedent`
                function neuterPlural(word) {
                  return word.replace(/um$/, 'a');
                }
                plural.addRule('bacterium', neuterPlural);
                plural.addRule('memorandum', neuterPlural);`,
      ],
      { ...defaultPromptOptions(), includeSnippets: true }
    );

    const expectedPrompt = dedent`
            let mocha = require('mocha');
            let assert = require('assert');
            let plural = require('plural');
            // usage #1
            // plural.addRule("goose", "geese");
            // usage #2
            // function neuterPlural(word) {
            //   return word.replace(/um$/, 'a');
            // }
            // plural.addRule('bacterium', neuterPlural);
            // plural.addRule('memorandum', neuterPlural);
            // plural.addRule(match, result)
            describe('test plural', function() {
                it('test plural.addRule', function(done) {\n
        `;

    expect(prompt.assemble()).to.equal(expectedPrompt);
  });

  it("should assemble a prompt with doc comments and snippets", () => {
    const fun = APIFunction.fromSignature("plural.addRule(match, result)");
    fun.descriptor.docComment = "*\n* adds rule \n* @param {string}";

    const prompt = new Prompt(
      fun,
      [
        dedent`
            plural.addRule("goose", "geese");`,
        dedent`
            function neuterPlural(word) {
              return word.replace(/um$/, 'a');
            }
            plural.addRule('bacterium', neuterPlural);
            plural.addRule('memorandum', neuterPlural);`,
      ],
      {
        ...defaultPromptOptions(),
        includeSnippets: true,
        includeDocComment: true,
      }
    );

    const expectedPrompt = dedent`
            let mocha = require('mocha');
            let assert = require('assert');
            let plural = require('plural');
            // usage #1
            // plural.addRule("goose", "geese");
            // usage #2
            // function neuterPlural(word) {
            //   return word.replace(/um$/, 'a');
            // }
            // plural.addRule('bacterium', neuterPlural);
            // plural.addRule('memorandum', neuterPlural);
            // adds rule
            // @param {string}
            // plural.addRule(match, result)
            describe('test plural', function() {
                it('test plural.addRule', function(done) {\n
        `;

    expect(prompt.assemble()).to.equal(expectedPrompt);
  });
});

describe("test completion of tests", () => {
  it("should complete a test", () => {
    const prompt = new Prompt(
      APIFunction.fromSignature(
        "zip-a-folder.ZipAFolder.tar(srcFolder, tarFilePath, zipAFolderOptions) async"
      ),
      [],
      defaultPromptOptions()
    );
    const body = "        assert.equal(1, 1);\n        done();";

    const expectedTest = dedent`
            let mocha = require('mocha');
            let assert = require('assert');
            let zip_a_folder = require('zip-a-folder');
            describe('test suite', function() {
                it('test case', function(done) {
                    assert.equal(1, 1);
                    done();
                })
            })
        `;

    expect(prompt.completeTest(body)).to.equal(expectedTest);
  });
});
