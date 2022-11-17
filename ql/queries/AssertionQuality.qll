/**
 * Classes and predicates for working with TestPilot-generated reports.
 */

import javascript

/**
 * A report.json file, representing all data collected for a particular
 * benchmark.
 */
class ReportJson extends JsonObject {
  ReportJson() {
    this.isTopLevel() and
    this.getFile().getBaseName() = "report.json"
  }

  /** Gets the `tests/` folder next to this file. */
  Folder getTestFolder() { result = this.getFile().getParentContainer().getFolder("tests") }

  GeneratedTest getTest(string name) {
    result.getReport() = this and
    result.getBaseName() = name
  }

  GeneratedTest getTestById(int id) {
    exists(string strid |
      result = this.getTest("test_" + strid + ".js") and
      id = strid.toInt()
    )
  }

  /** Gets the metadata in this report. */
  JsonObject getMetadata() { result = this.getPropValue("metaData") }

  /** Gets the package name for this benchmark run. */
  string getPackageName() { result = this.getMetadata().getPropStringValue("packageName") }

  /** Gets a prompt in this report. */
  Prompt getAPrompt() { result.getReport() = this }

  /** Gets a test in this report. */
  GeneratedTest getATest() { result.getReport() = this }

  /** Gets a non-trivial test in this report. */
  GeneratedTest getANonTrivialTest() {
    result.getReport() = this and
    result.isNonTrivial()
  }

  /** Gets the total number of statements in the project covered by this report. */
  int getNumberOfStatements() {
    result =
      getPropValue("coverage")
          .getPropValue("total")
          .getPropValue("statements")
          .getPropValue("total")
          .getIntValue()
  }

  /** Gets the total number of passing tests in this report. */
  int getNumberOfTests() { result = count(GeneratedTest test | test.getReport() = this) }

  /** Holds if test `testName` in this report covers statement `stmtId`. */
  predicate testCoversStmt(string testName, string stmtId) {
    exists(JsonObject test |
      test = this.getPropValue("tests").getElementValue(_) and
      test.getPropStringValue("testName") = testName and
      stmtId = test.getPropValue("coveredStatements").getElementValue(_).getStringValue()
    )
  }

  /** Gets the status of test `testName`. */
  string getTestStatus(string testName) {
    exists(JsonObject test |
      test = this.getPropValue("tests").getElementValue(_) and
      test.getPropStringValue("testName") = testName and
      result = test.getPropStringValue("status")
    )
  }

  /** Gets the error message of test `testName`, if any. */
  string getTestErrMsg(string testName) {
    exists(JsonObject test |
      test = this.getPropValue("tests").getElementValue(_) and
      test.getPropStringValue("testName") = testName and
      result = test.getPropValue("err").getPropValue("message").getStringValue()
    )
  }

  /** Gets the error stack trace of test `testName`, if any. */
  string getTestErrStack(string testName) {
    exists(JsonObject test |
      test = this.getPropValue("tests").getElementValue(_) and
      test.getPropStringValue("testName") = testName and
      result = test.getPropValue("err").getPropValue("stack").getStringValue()
    )
  }

  /** Gets the error code of test `testName`, if any. */
  string getTestErrCode(string testName) {
    exists(JsonObject test |
      test = this.getPropValue("tests").getElementValue(_) and
      test.getPropStringValue("testName") = testName and
      result = test.getPropValue("err").getPropValue("code").getStringValue()
    )
  }

  override string toString() { result = getPackageName() }
}

/** A TestPilot-generated test stored in the report. */
class GeneratedTest extends File {
  ReportJson report;

  GeneratedTest() { this.getParentContainer() = report.getTestFolder() }

  /** Gets the report to which this test belongs. */
  ReportJson getReport() { result = report }

  /** Gets the name of the package for which this test was generated. */
  string getPackageName() { result = report.getPackageName() }

  /**
   * Holds if this test is non-trivial, i.e., it contains an assertion
   * that semantically depends on the package under test.
   */
  predicate isNonTrivial() {
    exists(AssertionInGeneratedTest a | a.getFile() = this and a.isNonTrivial())
  }

  /** Holds if this test covers the given statement. */
  predicate coversStmt(string stmtId) { report.testCoversStmt(this.getBaseName(), stmtId) }

  string getStatus() { result = report.getTestStatus(this.getBaseName()) }

  /** Holds if this test passes. */
  predicate passes() { this.getStatus() = "PASSED" }

  /** Holds if this test fails. */
  predicate fails() { this.getStatus() = "FAILED" }

  /** Holds if this test fails with the given error message. */
  predicate failsWith(string msg) {
    this.fails() and msg = report.getTestErrMsg(this.getBaseName())
  }

  private predicate failsDueToInternal(ErrorCategory errorCategory) {
    errorCategory = "AssertionError" and
    report.getTestErrStack(this.getBaseName()).matches("%AssertionError%")
    or
    errorCategory = "FileSystemError" and
    report.getTestErrCode(this.getBaseName()) in [
        "EEXIST", "EISDIR", "ENOENT", "ENOTEMPTY", "EACCES"
      ]
    or
    errorCategory = "CorrectnessError" and
    report
        .getTestErrStack(this.getBaseName())
        .matches([
            "%ReferenceError%", "%TypeError%", "%done() invoked with non-Error%",
            "%Maximum call stack size exceeded%",
          ])
    or
    errorCategory = "CorrectnessError" and
    report.getTestErrMsg(this.getBaseName()).matches("%Invalid syntax%")
    or
    errorCategory = "TimeoutError" and
    report.getTestErrCode(this.getBaseName()) = "ERR_MOCHA_TIMEOUT"
  }

  predicate failsDueTo(ErrorCategory errorCategory) {
    this.failsDueToInternal(errorCategory)
    or
    this.fails() and
    not this.failsDueToInternal(_) and
    errorCategory = "OtherError"
  }
}

/**
 * An assertion in a TestPilot-generated test.
 */
class AssertionInGeneratedTest extends DataFlow::Node {
  GeneratedTest test;

  AssertionInGeneratedTest() {
    this = API::moduleImport("assert").getASuccessor*().getACall() and
    test = this.getFile()
  }

  /**
   * Gets a node in the (intra-procedural) backwards slice of this assertions.
   */
  DataFlow::Node getANodeInBackwardsSlice() {
    result = this
    or
    // follow data flow
    DataFlow::localFlowStep(result, this.getANodeInBackwardsSlice())
    or
    // follow taint flow
    TaintTracking::sharedTaintStep(result, this.getANodeInBackwardsSlice())
    or
    // follow syntactic nesting: if an expression is in the backwards slice,
    // then so are all its subexpressions
    result.asExpr().getParent+() = this.getANodeInBackwardsSlice().asExpr()
    or
    // heuristic to approximate flow through callbacks: for `foo(bar, cb)` we
    // add both `foo` and `bar` to the backwards slice of any node in the callback
    // function `cb` to approximate inter-procedural data and control dependencies
    exists(DataFlow::InvokeNode call |
      call.getABoundCallbackParameter(_, _) = this.getANodeInBackwardsSlice()
      or
      exists(Function cb | cb = call.getAnArgument().getAFunctionValue().getFunction() |
        cb = this.getANodeInBackwardsSlice().getContainer()
      )
    |
      result = call.getAnArgument() or
      result = call.getCalleeNode()
    )
    or
    // heuristic to approximate side effects: for `foo(bar)` we assume that
    // `foo` may update any property of `bar`, and so we include `foo` in the
    // backwards slice of any other uses of `bar`
    exists(DataFlow::InvokeNode call, DataFlow::SsaDefinitionNode v |
      call.getAnArgument().getAPredecessor() = v and
      v = this.getANodeInBackwardsSlice() and
      result = call.getCalleeNode()
    )
  }

  /**
   * Holds if this assertion is non-trivial, i.e., it semantically depends on
   * the package under test.
   */
  predicate isNonTrivial() {
    exists(Require req | req = this.getANodeInBackwardsSlice().asExpr() |
      req.getImportedPath().getValue() = test.getPackageName()
    )
  }
}

class PromptJson extends JsonObject {
  ReportJson report;

  PromptJson() {
    this.isTopLevel() and
    this.getFile().getBaseName() = "prompts.json" and
    this.getFile().getParentContainer() = report.getFile().getParentContainer()
  }

  /** Gets the report to which this prompt belongs. */
  ReportJson getReport() { result = report }
}

class Prompt extends JsonObject {
  PromptJson prompts;

  Prompt() { this = prompts.getPropValue("prompts").(JsonArray).getElementValue(_) }

  ReportJson getReport() { result = prompts.getReport() }

  GeneratedTest getATest(boolean passes, boolean nontrivial) {
    exists(string testName |
      testName = this.getPropValue("tests").(JsonArray).getElementStringValue(_) and
      result = getReport().getTest(testName)
    ) and
    (if result.passes() then passes = true else passes = false) and
    (if result.isNonTrivial() then nontrivial = true else nontrivial = false)
  }

  int getId() { result = this.getPropValue("id").getIntValue() }

  private JsonObject getProvenanceInfo() {
    result = this.getPropValue("provenance") or
    result = this.getPropValue("provenance").(JsonArray).getElementValue(_)
  }

  predicate isRefinedFrom(Prompt originalPrompt, GeneratedTest test, string refiner) {
    exists(JsonObject provenance | provenance = getProvenanceInfo() |
      refiner = provenance.getPropStringValue("refiner") and
      test = this.getReport().getTestById(provenance.getPropValue("test").getIntValue()) and
      originalPrompt.getId() = provenance.getPropValue("originalPrompt").getIntValue() and
      originalPrompt.getReport() = this.getReport()
    )
  }

  predicate isRefinedFrom(Prompt originalPrompt, string refiner) {
    this.isRefinedFrom(originalPrompt, _, refiner)
  }

  string getAProvenance() {
    not this.isRefinedFrom(_, _) and
    result = ""
    or
    exists(Prompt originalPrompt, string refiner | this.isRefinedFrom(originalPrompt, refiner) |
      result = originalPrompt.getAProvenance() + "," + refiner
    )
  }

  /** Holds if this prompt can be generated without the given refiner. */
  predicate doesNotNeed(Refiner refiner) {
    exists(string provenance | provenance = this.getAProvenance() |
      not provenance.regexpMatch(".*\\b\\Q" + refiner + "\\E\\b.*")
    )
  }

  override string toString() { result = prompts.getReport() + ":prompt" + this.getId() }
}

class Refiner extends string {
  Refiner() { any(Prompt p).isRefinedFrom(_, this) }
}

/** A symbolic representation of a cause for test failure. */
class ErrorCategory extends string {
  ErrorCategory() {
    this = "AssertionError" or
    this = "FileSystemError" or
    this = "CorrectnessError" or
    this = "TimeoutError" or
    this = "OtherError"
  }
}
