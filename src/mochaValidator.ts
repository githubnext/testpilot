import path from "path";
import fs from "fs";
import os from "os";
import child_process from "child_process";
import { spawnSync } from "child_process";
import { TestValidator } from "./testValidator";
import { ITestFailureInfo, TestOutcome } from "./report";
import { ICoverageSummary, emptyCoverageSummary } from "./coverage";
import { performance } from "perf_hooks";

/**
 * A bare-bones type definition for a Mocha test result, only modelling the
 * fields we need.
 */
interface IMochaTestResult {
  err: {
    message?: string;
  };
}

/**
 * A bare-bones type definition for a Mocha test report, only modelling the
 * fields we need.
 */
interface IMochaReport {
  passes: IMochaTestResult[];
  failures: IMochaTestResult[];
  pending: IMochaTestResult[];
}

export class MochaValidator extends TestValidator {
  private readonly testDir: string;
  private readonly coverageDirs: string[] = [];

  constructor(private packageName: string, private packagePath: string) {
    super();
    this.testDir = fs.mkdtempSync(path.join(packagePath, "test-"));
  }

  private scrubTestDirFromError(error: ITestFailureInfo): ITestFailureInfo {
    if (!error || typeof error !== "object") {
      console.warn(`Unexpected error type: ${typeof error}`);
      return error;
    } else if (typeof error.message !== "string") {
      console.warn(`Unexpected error.message type: ${typeof error.message}`);
      return error;
    }
    error.message = error.message.replace(
      new RegExp(this.testDir, "g"),
      "/path/to/test"
    );
    return error;
  }

  public validateTest(testName: string, testSource: string): TestOutcome {
    const requirePattern = new RegExp(
      `require\\('${this.packageName}'\\)`,
      "g"
    );
    let testFile = path.join(this.testDir, testName);
    if (fs.existsSync(testFile)) {
      throw new Error(`Test file ${testFile} already exists`);
    }
    fs.writeFileSync(
      testFile,
      testSource.replace(requirePattern, `require('..')`)
    );

    const packagePath = path.resolve(this.testDir, "..");

    // temporary directory to store output from mocha and nyc
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mocha-validator"));
    // directory to store nyc profile and coverage data
    const coverageDir = path.join(tmpDir, "coverage");
    // coverage report, produced by nyc
    const coverageReport = path.join(coverageDir, "coverage-final.json");
    // test report, produced by mocha
    const reportFile = path.join(tmpDir, "report.json");

    performance.mark(`start:${testName}`);
    const res = spawnSync(
      path.join(__dirname, "..", "node_modules", ".bin", "nyc"),
      [
        `--cwd=${packagePath}`,
        `--exclude=${path.basename(this.testDir)}`,
        "--reporter=json",
        `--report-dir=${coverageDir}`,
        `--temp-dir=${coverageDir}`,
        path.join(__dirname, "..", "node_modules", ".bin", "mocha"),
        "--full-trace",
        "--exit",
        "--allow-uncaught=false",
        "--reporter=json",
        "--reporter-option",
        `output=${reportFile}`,
        "--",
        testFile,
      ],
      {
        timeout: 5000,
        killSignal: "SIGKILL",
      }
    );
    performance.measure(`duration:${testName}`, `start:${testName}`);
    const stderr = res.stderr.toString();
    const report = MochaValidator.tryParseReport(reportFile);

    // parse test results; this is a bit complicated since Mocha sometimes reports asynchroneous tests
    // as both passed and failed; we want to make sure to count them as failed
    let outcome: TestOutcome = TestOutcome.OTHER;
    if (
      res.status != 0 ||
      stderr.includes("AssertionError") ||
      !report ||
      report.failures.length > 0
    ) {
      // we need to construct a ITestFailureInfo object
      // first, try to get it from the report
      if (
        report &&
        report.failures.length > 0 &&
        report.failures[0].err.message
      ) {
        outcome = TestOutcome.FAILED(
          this.scrubTestDirFromError(report.failures[0].err as ITestFailureInfo)
        );
      } else {
        // if that fails, try to get it from stderr
        const match = stderr.match(/(AssertionError: .*)/);
        if (match) {
          outcome = TestOutcome.FAILED(
            this.scrubTestDirFromError({ message: match[1] })
          );
        } else {
          // if that fails, just use the whole stderr or (if that's empty) the exit code
          outcome = TestOutcome.FAILED(
            this.scrubTestDirFromError({
              message: stderr ?? `Mocha exited with code ${res.status}`,
            })
          );
        }
      }
    } else {
      // further sanity check: there should be exactly one result (either passed or pending)
      const numResults = report.passes.length + report.pending.length;
      if (numResults != 1) {
        throw new Error(`Expected 1 test result, got ${numResults}`);
      }

      if (report.passes.length > 0) {
        outcome = TestOutcome.PASSED(coverageReport, coverageDir);
        this.coverageDirs.push(coverageDir);
      } else {
        outcome = TestOutcome.PENDING;
      }
    }

    // no need to keep coverage data for invalid tests
    if (outcome.status != "PASSED") {
      fs.rmdirSync(coverageDir, { recursive: true });
    }
    return outcome;
  }

  private static tryParseReport(reportFile: string): IMochaReport | undefined {
    try {
      return JSON.parse(fs.readFileSync(reportFile, "utf8"));
    } catch (e: any) {
      console.warn(`Error parsing coverage report: ${e}`);
      return undefined;
    }
  }

  public computeCoverageSummary(): ICoverageSummary {
    if (this.coverageDirs.length == 0) {
      return emptyCoverageSummary();
    }

    const testDir = fs.mkdtempSync(path.join(this.packagePath, "test-"));
    try {
      // create/clean .nyc_output directory
      const nycOutput = path.join(this.packagePath, ".nyc_output");
      if (fs.existsSync(nycOutput)) {
        fs.rmdirSync(nycOutput, { recursive: true });
      }
      fs.mkdirSync(nycOutput);

      // copy all .json files from coverageDirs to nycOutput
      for (const coverageDir of this.coverageDirs) {
        MochaValidator.copyCoverageData(coverageDir, nycOutput);
      }

      // create nyc report
      child_process.spawnSync(
        path.join(__dirname, "..", "node_modules", ".bin", "nyc"),
        [
          `--report-dir=${path.join(testDir, "coverage")}`,
          "--reporter=json-summary",
          "report",
        ],
        {
          cwd: this.packagePath,
          stdio: "inherit",
        }
      );

      const coverageSummaryFileName = path.join(
        testDir,
        "coverage",
        "coverage-summary.json"
      );
      if (fs.existsSync(coverageSummaryFileName)) {
        return JSON.parse(fs.readFileSync(coverageSummaryFileName, "utf8"));
      } else {
        throw new Error(
          `Failed to generate coverage summary: ${coverageSummaryFileName} does not exist.`
        );
      }
    } finally {
      fs.rmdirSync(testDir, { recursive: true });
    }
  }

  /**
   * Copy all .json files from `src` to `dest` (which must exist).
   */
  public static copyCoverageData(src: string, dest: string) {
    for (const file of fs.readdirSync(src)) {
      if (file.endsWith(".json") && file !== "coverage-final.json") {
        fs.copyFileSync(path.join(src, file), path.join(dest, file));
      }
    }
  }

  public cleanup(): void {
    for (const coverageDir of this.coverageDirs) {
      fs.rmdirSync(coverageDir, { recursive: true });
    }
  }
}
