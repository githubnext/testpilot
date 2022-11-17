import { expect } from "chai";
import dedent from "dedent";
import fs from "fs";
import path from "path";
import { MochaValidator } from "../src/mochaValidator";
import { TestStatus } from "../src/report";

describe("MochaValidator", function () {
  this.timeout(10000);

  function check(tests: string[], expectedOutcomes: TestStatus[]) {
    const testDir = fs.mkdtempSync(path.join(".", "test-"));
    const validator = new MochaValidator("", testDir);
    try {
      for (let i = 0; i < tests.length; i++) {
        const testName = `test_${i}.js`;
        const valid = validator.validateTest(testName, tests[i]);
        expect(valid.status).to.equal(expectedOutcomes[i]);
      }
    } finally {
      fs.rmdirSync(testDir, { recursive: true });
      validator.cleanup();
    }
  }

  it("should run tests and report pass", () => {
    let tests = [
      dedent`let mocha = require('mocha');
                    let assert = require('assert');
                    describe('test', () => {
                        it('test', () => {
                            assert([1, 2, 3].length === 3);
                        });
                    });`,
      dedent`let mocha = require('mocha');
                    let expect = require('chai').expect;
                    describe('test', () => {
                        it('test', () => {
                            expect([1, 2, 3, 4, 5].slice(1, 3)).to.eql([2, 3]);
                        });
                    });`,
    ];
    check(tests, [TestStatus.PASSED, TestStatus.PASSED]);
  });

  it("should run tests and report fail", () => {
    let tests = [
      dedent`let mocha = require('mocha');
                    let assert = require('assert');
                    describe('test', () => {
                        it('test', () => {
                            assert([1, 2, 3].length === 2);
                        });
                    });`,
      dedent`let mocha = require('mocha');
                    let expect = require('chai').expect;
                    describe('test', () => {
                        it('test', () => {
                            expect([1, 2, 3, 4, 5].slice(1, 3)).to.eql([3, 4]);
                        });
                    });`,
    ];
    check(tests, [TestStatus.FAILED, TestStatus.FAILED]);
  });

  it("should correctly classify a test reported as both passing and failing by Mocha", () => {
    let test = dedent`
            const fs = require('fs');
            describe('test fs', function() {
                it('test fs.ReadStream.prototype.push', function(done) {
                    let rs = fs.createReadStream(__filename);
                    rs.push("hello world");
                    rs.on("data", () => done());
                })
            })
        `;
    check([test], [TestStatus.FAILED]);
  });

  it.skip("should correctly classify another test reported as both passing and failing by Mocha", () => {
    let test = dedent`
            describe('test fs', function() {
                it('test fs.ReadStream', function(done) {
                    new require('fs').ReadStream('/i/absolutely/do/not/exist');
                    done();
                })
            })
        `;
    check([test], [TestStatus.FAILED]);
  });

  it("should be robust against Mocha crashing and not producing a report", () => {
    let test = "describe('totally broken test', function() {)";
    check([test], [TestStatus.FAILED]);
  });

  it("should be robust against non-terminating tests (this test takes about five seconds)", () => {
    let test = dedent`
            let assert = require('assert');
            let glob = require('glob');
            describe('test glob', function() {
                it('test glob.Glob.prototype.setMaxListeners', function(done) {
                    glob.Glob.prototype.setMaxListeners(2);
                    let p = glob.Glob("./**/**/**/**/**/**/**/**/**/**/**/**/**/**/**/**/**/**/**/**/**/**/**/**/**/**/**/**/**/**/**/**/**/**/**/**/**/**/**/**/**/**/**/**/**/**/**/**/**/**/**/**/*/index.js", {nodir: true}, (err, files) => {
                        console.log("end");
                        console.log(p);
                    })
                })
            })
        `;
    check([test], [TestStatus.FAILED]);
  }).timeout(6000);

  it("should not classify a test as failing simply because it prints an error message to stderr", () => {
    let test = dedent`
            let assert = require('assert');
            describe('test', function() {
                it('test', function(done) {
                    console.error("Error: hello world");
                    assert(true);
                    done();
                })
            })
        `;
    check([test], [TestStatus.PASSED]);
  });
});
