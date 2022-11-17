import * as fs from "fs";
import * as path from "path";
import {
  APIFunction,
  BaseTestResultCollector,
  IMetaData,
  ITestInfo,
  ITestReport,
  MochaValidator,
  ReportForTest,
  TestOutcome,
  TestStatus,
} from "..";
import { PerformanceMeasurer } from "./performanceMeasurer";
import {
  createUniqueStmtId,
  getCoveredStmtsForFile,
} from "./testCollectorHelper";

/**
 * A full-featured test-result collector that can be used to persist information
 * to disk.
 */
export class TestResultCollector extends BaseTestResultCollector {
  private readonly metaData: IMetaData;

  /**
   * constructor registers meta-data associated with a test run
   *
   * @param outputDir: the directory in which to write the report and other files
   * @param snippetsTypeAsString: the type of snippets used to generate the tests (code, doc, both, or none)
   * @param numSnippets: number of snippets to include in a prompt (default 3)
   * @param snippetLength: length of each snippet (maximum length of each snippet in lines (default 20 lines))
   * @param temperature: sampling temperature for obtaining completions (default 0)
   * @param numCompletions: number of completions to obtain for each prompt (default 5)
   */
  constructor(
    packageName: string,
    private readonly packagePath: string,
    private readonly outputDir: string,
    private readonly api: APIFunction[],
    private readonly snippetMap: Map<string, string[]>,
    private readonly perf: PerformanceMeasurer,
    snippetsTypeAsString: string,
    numSnippets: number | "all",
    snippetLength: number,
    numCompletions: number
  ) {
    super();
    this.metaData = {
      packageName,
      useDocSnippets:
        snippetsTypeAsString === "doc" || snippetsTypeAsString === "both",
      useCodeSnippets:
        snippetsTypeAsString === "code" || snippetsTypeAsString === "both",
      numSnippets,
      snippetLength,
      numCompletions,
    };
    this.createOutputDir();
  }

  private getTestsWithStatus(status: TestStatus) {
    return [...this.tests.values()].filter(
      (test) => test.outcome.status === status
    );
  }

  public getNrPasses() {
    return this.getTestsWithStatus(TestStatus.PASSED).length;
  }

  public getNrFailures() {
    return this.getTestsWithStatus(TestStatus.FAILED).length;
  }

  public getNrPending() {
    return this.getTestsWithStatus(TestStatus.PENDING).length;
  }

  public getNrOther() {
    return this.getTestsWithStatus(TestStatus.OTHER).length;
  }

  public getReport(): ITestReport {
    return {
      metaData: this.metaData,
      nrUniqueSnippets: this.computeNrUniqueSnippets(),
      stats: {
        nrTests: this.tests.size,
        nrPasses: this.getNrPasses(),
        nrFailures: this.getNrFailures(),
        nrPending: this.getNrPending(),
        nrOther: this.getNrOther(),
        apiExplorationTime: this.perf.getApiExplorationTime()!,
        docCommentExtractionTime: this.perf.getDocCommentExtractionTime()!,
        snippetExtractionTime: this.perf.getSnippetExtractionTime()!,
        codexQueryTime: this.perf.getTotalCodexQueryTime(),
        totalTime: this.perf.getTotalTime(),
      },
      tests: [...this.tests.values()].map(this.getReportForTest, this),
      coverage: this.coverageSummary,
    };
  }

  private getReportForTest(test: ITestInfo): ReportForTest {
    const promptIds = test.prompts.map(
      (prompt) => this.prompts.get(prompt)!.id
    );
    const err =
      test.outcome.status === TestStatus.FAILED ? test.outcome.err : {};
    const coveredStatements = this.getCoveredStatements(test.outcome);
    return {
      testName: test.testName,
      api: test.api,
      testFile: test.testName,
      promptIds: promptIds,
      status: test.outcome.status as TestStatus,
      err: err,
      coveredStatements: coveredStatements,
      duration: this.perf.getTestDuration(test.testName),
    };
  }

  /**
   * Get the list of statements covered by the test with the given outcome.
   *
   * Tests that do not pass or that do not have a coverage summary are not
   * considered to cover any statements. For passing tests, covered statements are
   * represented in the form
   * '<file>@<startLine>:<startColumn>-<endLine>:<endColumn>'.
   */
  private getCoveredStatements(outcome: TestOutcome) {
    if (
      outcome.status !== TestStatus.PASSED ||
      outcome.coverageReport === undefined
    ) {
      return [];
    }
    const coveredStatements = [];
    const coverage = JSON.parse(
      fs.readFileSync(outcome.coverageReport, "utf8")
    );
    for (const file of Object.keys(coverage)) {
      const relpath = path.relative(this.packagePath, coverage[file].path);
      coveredStatements.push(
        ...getCoveredStmtsForFile(coverage[file], relpath)
      );
    }
    return coveredStatements;
  }

  /**
   * compute the number of unique snippets that are available in the snippet map
   * @returns the number of unique snippets
   */
  private computeNrUniqueSnippets(): number {
    const uniqueSnippets = new Set<string>();
    for (const snippetGroup of this.snippetMap.values()) {
      for (const snippet of snippetGroup) {
        uniqueSnippets.add(snippet);
      }
    }
    return uniqueSnippets.size;
  }

  /**
   * For passing tests, preprend a checkmark and make the text green.
   * For failing tests, prepend an 'x' and make the text red.
   * For other tests, prepend a '?' and make the text purple.
   */
  private getTestLabel(test: ITestInfo): string {
    const testName = test.testName;
    if (test.outcome.status === TestStatus.PASSED) {
      return "\u001b[32m" + "\u2713" + testName + "\u001b[0m";
    } else if (test.outcome.status === TestStatus.FAILED) {
      return "\u001b[31m" + "\u2717" + testName + "\u001b[0m";
    } else {
      return "\u001b[35m" + "\u2753" + testName + "\u001b[0m";
    }
  }

  /**
   * print summary of test results for each API method
   */
  private reportAPICoverage() {
    console.log("API coverage:");
    const testsPerAPI = new Map<string, Set<ITestInfo>>();
    for (const test of this.tests.values()) {
      const api = test.api;
      if (!testsPerAPI.has(api)) {
        testsPerAPI.set(api, new Set<ITestInfo>());
      }
      testsPerAPI.get(api)!.add(test);
    }
    for (const [api, tests] of testsPerAPI.entries()) {
      const testLabels = [...tests].map((test) => this.getTestLabel(test));
      console.log(`  ${api}: ${[...testLabels.values()].join(", ")}`);
    }
  }

  public report() {
    // write report to 'report.json' in the specified output directory
    const report = this.getReport();
    fs.writeFileSync(
      path.join(this.outputDir, "report.json"),
      JSON.stringify(report, null, 2)
    );

    // write out tests to 'tests' directory
    const testOutputDir = path.join(this.outputDir, "tests");
    const coverageDataDir = path.join(this.outputDir, "coverageData");
    for (const { testName, testSource, outcome } of this.tests.values()) {
      fs.writeFileSync(path.join(testOutputDir, testName), testSource);

      // copy coverage data if available
      if (outcome.status === "PASSED" && outcome.coverageData) {
        const destDir = path.join(
          coverageDataDir,
          path.basename(testName, ".js")
        );
        fs.mkdirSync(destDir, { recursive: true });
        MochaValidator.copyCoverageData(outcome.coverageData, destDir);
      }
    }

    // write out prompts to 'prompts' directory, and summary of prompts to 'prompts.json'
    const promptOutputDir = path.join(this.outputDir, "prompts");
    for (const promptInfo of this.prompts.values()) {
      fs.writeFileSync(
        path.join(promptOutputDir, promptInfo.file),
        promptInfo.prompt.assemble()
      );
    }
    let prompts = {
      metaData: this.metaData,
      prompts: [...this.prompts.values()].map(
        ({ prompt, id, file, temperature, completions }) => {
          const tests = [...this.tests.values()]
            .filter((test) => test.prompts.includes(prompt))
            .map((test) => test.testName);
          const provenance = prompt.provenance.map((p) => ({
            originalPrompt: this.prompts.get(p.originalPrompt)!.id,
            test: p.testId,
            refiner: p.refiner,
          }));
          return {
            id,
            file,
            temperature,
            completions: [...completions.values()],
            tests,
            provenance,
          };
        }
      ),
    };
    fs.writeFileSync(
      path.join(this.outputDir, "prompts.json"),
      JSON.stringify(prompts, null, 2)
    );

    // write API info to 'api.json'
    fs.writeFileSync(
      path.join(this.outputDir, "api.json"),
      JSON.stringify(this.api, null, 2)
    );

    // write snippetMap to 'snippetMap.json'
    fs.writeFileSync(
      path.join(this.outputDir, "snippetMap.json"),
      JSON.stringify([...this.snippetMap], null, 2)
    );

    // write Codex query times to 'codexQueryTimes.json'
    fs.writeFileSync(
      path.join(this.outputDir, "codexQueryTimes.json"),
      JSON.stringify(this.perf.getCodexQueryTimes(), null, 2)
    );

    // print summary statistics
    console.log(
      `${this.getNrPasses()} passed, ${this.getNrFailures()} failed, ${this.getNrPending()} pending, ${this.getNrOther()} other`
    );

    // print API coverage
    this.reportAPICoverage();
  }

  /**
   * Create directory for output files if it does not exist. If it does exist, delete it and its contents and create a new one.
   */
  private createOutputDir() {
    if (fs.existsSync(this.outputDir)) {
      fs.rmdirSync(this.outputDir, { recursive: true });
    }
    fs.mkdirSync(this.outputDir, { recursive: true });
    fs.mkdirSync(path.join(this.outputDir, "tests"));
    fs.mkdirSync(path.join(this.outputDir, "prompts"));
    fs.mkdirSync(path.join(this.outputDir, "coverageData"));
  }

  public recordTestResult(
    test: ITestInfo,
    temperature: number,
    outcome: TestOutcome
  ) {
    super.recordTestResult(test, temperature, outcome);
    console.log(
      `${test.testName} (for ${test.api} at temperature ${temperature}, ${test.prompts[0].usageSnippets.length} snippets available): ${outcome.status}`
    );
  }
}
