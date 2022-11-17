import { expect } from "chai";
import dedent from "dedent";
import { closeBrackets, commentOut, trimCompletion } from "../src/syntax";

describe("test closeBrackets", function () {
  it("should handle syntactically invalid code", function () {
    expect(
      closeBrackets(dedent`
            function f({) {
                return 1;
            }
        `)
    ).to.be.undefined;
  });

  it("should handle code that closes more brackets than it opens", function () {
    expect(
      closeBrackets(dedent`
            function f() {
                return 1;
            }}
        `)
    ).to.be.undefined;
  });

  it("should skip brackets in comments", function () {
    const complete = dedent`
            let mocha = require('mocha');
            let assert = require('assert');
            // testing {
            describe('test', () => {
                it('test', () => { // tests sth (
                    assert([1, 2, 3].length === 3);
                });
            });`;
    let result = closeBrackets(complete);
    expect(result).to.not.be.undefined;
    expect(result!.source).to.equal(complete);
  });

  let template = dedent`
    let mocha = require('mocha');
    let assert = require('assert');
    // testing (
    describe('test', () => {
        it('test', () => { // tests sth {
            assert([1, 2, 3].length === 3);<1>})}<2>)<3>`;

  for (const i of [1, 2, 3]) {
    it(`should complete from <${i}>`, function () {
      let incomplete = template
        .slice(0, template.indexOf(`<${i}>`))
        .replace(/<\d>/g, "");
      let complete = template.replace(/<\d>/g, "");
      let result = closeBrackets(incomplete);
      expect(result).to.not.be.undefined;
      expect(result!.source).to.equal(complete);
    });
  }

  it("should handle square brackets", function () {
    expect(
      closeBrackets(dedent`
            let arr = [
                [1, 2, 3],
                [4, 5, 6
            `)!.source
    ).to.equal(dedent`
            let arr = [
                [1, 2, 3],
                [4, 5, 6]]
            `);
  });
});

describe("test trimCompletion", function () {
  it("should trim off incomplete lines", function () {
    expect(
      trimCompletion(dedent`
            assert([1, 2, 3].length === 3);
            assert(
        `)
    ).to.equal(dedent`
            assert([1, 2, 3].length === 3);
        `);
  });

  it("should not trim off complete statements", function () {
    expect(
      trimCompletion(dedent`
            assert([1, 2, 3].length === 3);
            assert([1, 2].length === 2);
        `)
    ).to.equal(dedent`
            assert([1, 2, 3].length === 3);
            assert([1, 2].length === 2);
        `);
  });

  it("should not trim off complete statements, even if followed by whitespace", function () {
    expect(trimCompletion("assert([1, 2, 3].length === 3);  ")).to.equal(
      "assert([1, 2, 3].length === 3);"
    );
  });

  it("should not trim off complete blocks", function () {
    expect(
      trimCompletion(dedent`
            if (true) {
                assert([1, 2, 3].length === 3);
            }
        `)
    ).to.equal(dedent`
            if (true) {
                assert([1, 2, 3].length === 3);
            }
        `);
  });

  it("should correctly trim incomplete statements if there is only a single line", function () {
    expect(
      trimCompletion(dedent`
            assert(
        `)
    ).to.equal("");
  });

  it("should trim completions that close more brackets than they open", function () {
    expect(
      trimCompletion(dedent`
            assert([1, 2, 3].length === 3);
        });
        it('should do something else', function () {
            assert([1, 2].length === 2)
        `)
    ).to.equal(dedent`
            assert([1, 2, 3].length === 3);
        `);
  });

  it("should trim completions that close more parentheses than they open", function () {
    expect(
      trimCompletion(dedent`
            assert([1, 2, 3].length === 3));
        `)
    ).to.equal(dedent`
            assert([1, 2, 3].length === 3)
        `);
  });
});

describe("test commentOut", function () {
  it("should comment out a single line", function () {
    expect(commentOut("line\n")).to.equal("// line\n");
  });

  it("should comment out multiple lines", function () {
    expect(commentOut("line 1\nline 2\n")).to.equal("// line 1\n// line 2\n");
  });

  it("should add a final newline if it is missing", function () {
    expect(commentOut("line")).to.equal("// line\n");
  });

  it("should return the empty string if the input is empty", function () {
    expect(commentOut("")).to.equal("");
  });
});
