import {
  FunctionDescriptor,
  ITestFailureInfo,
  ITestReport,
  ReportForTest,
} from "..";

import fs from "fs";
import path from "path";
import { SimilarityReport } from "./editDistance";

// https://nodejs.org/api/errors.html#nodejs-error-codes
const FILE_SYS_ERRORS = ["EEXIST", "EISDIR", "ENOENT", "ENOTEMPTY", "EACCES"];

export type SimilarityStats = {
  [packageName: string]: {
    proj: string;
    similarityReport: SimilarityReport;
  };
};

export type CoverageStats = {
  [packageName: string]: {
    proj: string;
    nrUniqueSnippets: number;
    numTests: number;
    numPassing: number;
    stmtCoverage: number;
    branchCoverage: number;
    nonTrivialTests: number;
    nonTrivialPassing: number;
    nonTrivialCoverage: number | "unknown";
    numUniquelyCoveringTests: number | null;
  };
};

export type FailureStats = {
  [packageName: string]: {
    proj: string;
    numFailing: number;
    numAssertionErrors: number;
    numFileSysErrors: number;
    numCorrectnessErrors: number;
    numTimeoutErrors: number;
    numOther: number;
  };
};

export type PackageStats = {
  [packageName: string]: {
    proj: string;
    repo: string;
    sha: string;
    loc: number;
    numExistingTests: number;
    weeklyDownloads: number;
    stmtCoverageFromLoading: number;
    branchCoverageFromLoading: number;
    nrUniqueSnippets: number;
    numFunctions: number;
    numFunctionsWithExamples: number;
    numFunctionsWithDocComments: number;
  };
};

export type RefinersData = {
  [refinerName: string]: {
    passingTests: number;
    coverage: number;
    nonTrivialCoverage: number;
  };
};

export type RefinerStats = {
  refinerNames: Set<string>;
  stats: {
    [packageName: string]: {
      proj: string;
      refinersData: RefinersData;
    };
  };
};

/**
 * Categorize types of failures in given tests
 * @param data report data, as found in report.json
 * @returns an object with the number of occurrences of each type of failure
 */
function getFailedStats(data: ITestReport) {
  const failures = data.tests
    .filter((test) => test.status === "FAILED")
    .map((test) => test.err as ITestFailureInfo);
  const numFailing = failures.length;

  let numAssertionErrors = 0;
  let numFileSysErrors = 0;

  //correctness errors include Type errors, Reference errors, done errors, and infinite recursion/call stack errors
  let numCorrectnessErrors = 0;

  let numTimeoutErrors = 0;
  let numOther = 0;

  for (const failure of failures) {
    if (isAssertionError(failure)) {
      numAssertionErrors++;
    } else if (isFileSysError(failure)) {
      numFileSysErrors++;
    } else if (isCorrectnessError(failure) || isSyntaxError(failure)) {
      numCorrectnessErrors++;
    } else if (isTimedOutTest(failure)) {
      numTimeoutErrors++;
    } else {
      numOther++;
    }
  }

  return {
    numFailing,
    numAssertionErrors,
    numFileSysErrors,
    numCorrectnessErrors,
    numTimeoutErrors,
    numOther,
  };
}

function isSyntaxError(err: ITestFailureInfo) {
  if (!err.message) return false;
  return err.message.includes("Invalid syntax");
}

/**
 * Checks if tests fails because of a correctness error (right now: type error, reference error, done error, infinite recursion/call stack error)
 * @param err test failure info to check
 * @returns true/false
 */
function isCorrectnessError(err: ITestFailureInfo) {
  if (!err.stack) return false;
  return (
    err.stack.includes("ReferenceError") ||
    err.stack.includes("TypeError") ||
    err.stack.includes("done() invoked with non-Error") ||
    err.stack.includes("Maximum call stack size exceeded")
  );
}

/**
 * Checks if tests fails because of an assertion error
 * @param err test failure info to check
 * @returns true/false
 */
function isAssertionError(err: ITestFailureInfo) {
  if (!err.stack) return false;
  return err.stack.includes("AssertionError");
}

/**
 * Checks if tests fails because of file system errors, as defined in FILE_SYS_ERRORS
 * @param err test failure info to check
 * @returns true/false
 */
function isFileSysError(err: ITestFailureInfo) {
  if (!err.code) return false;
  return FILE_SYS_ERRORS.includes(err.code);
}

/**
 * Checks if tests fails because of time outs
 * @param err test failure info to check
 * @returns true/false
 */
function isTimedOutTest(err: ITestFailureInfo) {
  if (!err.code) return false;
  return err.code === "ERR_MOCHA_TIMEOUT";
}

/**
 * Parse the `report.json`, `stats.json`,  and `api.json` files for all projects under the
 * given root directory and return five objects summarizing the results:
 *
 * - `coverageStats`: a mapping from project configuration (i.e., project name
 *   plus number of snippets) to an object with statistics about the project and
 *   the statement coverage our tests achieve
 * - `failureStats`: a mapping from project configuration to an object with
 *   statistics on the kinds of test failures we observe
 * - `packageStats`: a mapping from project configuration to an object with
 *   descriptive statistics of the packages
 * - `refinerStats`: a mapping from project configuration to an object with
 *   the coverage data of each refiner
 * - `performanceStats`: a mapping from project configuration to an object with
 *  performance data
 * - `similarityStats`: a mapping from project configuration to an object with
 *  similarity data (Based on edit distance)
 */
export function parseReports(
  root: string,
  calculateUniquelyCoveringTests = false
) {
  const coverageStats: CoverageStats = {};
  const failureStats: FailureStats = {};
  const packageStats: PackageStats = {};
  const refinersStats: RefinerStats = { refinerNames: new Set(), stats: {} };
  const performanceStats: any = {};
  const similarityStats: any = {};

  for (const proj of fs.readdirSync(root)) {
    if (proj === ".DS_Store") {
      continue;
    }
    const projDir = path.join(root, proj);
    const reportFile = path.join(projDir, "report.json");

    const data = JSON.parse(fs.readFileSync(reportFile, "utf8")) as ITestReport;

    var packageName = data.metaData.packageName;

    //special handling of gitlab-js
    if (packageName !== undefined && packageName.includes("/")) {
      const parts = packageName.split("/");
      packageName = parts[1];
    }

    const numTests = data.stats?.nrTests ?? 0;
    const numPassing = data.stats?.nrPasses ?? 0;
    const nrUniqueSnippets = data.nrUniqueSnippets ?? 0;
    const stmtCoverage = data.coverage?.total.statements?.pct ?? 0;
    const branchCoverage = data.coverage?.total.branches?.pct ?? 0;
    const nonTrivialTests = data.stats?.nrNonTrivialTests ?? 0;
    const nonTrivialPassing = data.stats?.nrNonTrivialPasses ?? 0;
    const nonTrivialCoverage =
      data.coverage?.total.statements?.nonTrivialPct ?? 0;
    const apiExplorationTime = data.stats?.apiExplorationTime ?? -1;
    const docCommentExtractionTime = data.stats?.docCommentExtractionTime ?? -1;
    const snippetExtractionTime = data.stats?.snippetExtractionTime ?? -1;
    const codexQueryTime = data.stats?.codexQueryTime ?? -1;
    const totalTime = data.stats?.totalTime ?? -1;
    var numExistingTests = -1;

    let numUniquelyCoveringTests = null;
    if (calculateUniquelyCoveringTests) {
      numUniquelyCoveringTests = getNumUniquelyCoveringTests(data.tests);
    }

    coverageStats[packageName] = {
      proj,
      nrUniqueSnippets,
      numTests,
      numPassing,
      stmtCoverage: stmtCoverage,
      branchCoverage: branchCoverage,
      nonTrivialTests,
      nonTrivialPassing,
      nonTrivialCoverage,
      numUniquelyCoveringTests,
    };

    failureStats[packageName] = { proj, ...getFailedStats(data) };

    const refinersReport = path.join(projDir, "refiners.json");
    if (fs.existsSync(refinersReport)) {
      const refinersData = JSON.parse(fs.readFileSync(refinersReport, "utf8"));
      refinersStats.stats[packageName] = { proj, refinersData };
      for (const refinerName of Object.keys(refinersData)) {
        refinersStats.refinerNames.add(refinerName);
      }
    }

    const packageStatsReport = path.join(projDir, "stats.json");
    const snippetsReport = path.join(projDir, "snippetMap.json");
    const apiReport = path.join(projDir, "api.json");
    const apiStats = getAPIStats(snippetsReport, apiReport);
    if (fs.existsSync(packageStatsReport)) {
      const packageStatsData = JSON.parse(
        fs.readFileSync(packageStatsReport, "utf8")
      );
      const weeklyDownloads = packageStatsData.weeklyDownloads;
      const stmtCoverageFromLoading =
        packageStatsData.coverageFromLoading.statements?.pct ?? 0;
      const branchCoverageFromLoading =
        packageStatsData.coverageFromLoading.branches?.pct ?? 0;
      const repo = packageStatsData.repository;
      const sha = packageStatsData.sha;
      const loc = packageStatsData.loc;

      packageStats[packageName] = {
        proj,
        repo,
        sha,
        loc,
        numExistingTests,
        weeklyDownloads,
        stmtCoverageFromLoading,
        branchCoverageFromLoading,
        nrUniqueSnippets,
        ...apiStats,
      };
    }

    performanceStats[packageName] = {
      proj,
      apiExplorationTime,
      docCommentExtractionTime,
      snippetExtractionTime,
      codexQueryTime,
      totalTime,
      ...apiStats,
    };

    const similarityStatsReport = path.join(projDir, "similarityReport.json");
    if (fs.existsSync(similarityStatsReport)) {
      const similarityReport = JSON.parse(
        fs.readFileSync(similarityStatsReport, "utf8")
      );

      similarityStats[packageName] = {
        proj,
        similarityReport,
      };

      packageStats[packageName].numExistingTests =
        similarityReport.numExistingTests;
    }
  }

  return {
    coverageStats,
    failureStats,
    refinersStats,
    packageStats,
    performanceStats,
    similarityStats,
  };
}

/***
 * Parse `api.json` and `snippetMap.json` files of a project and return an object containing the following statistics:
 * - `numFunctions`: number of functions in the project
 * - `numFunctionsWithExamples`: number of functions with at least one example
 * - `numFunctionsWithDocComments`: number of functions with doc comments
 */
function getAPIStats(snippetsReport: string, apiReport: string) {
  let numFunctions = -1;
  let numFunctionsWithExamples = -1;
  let numFunctionsWithDocComments = -1;

  if (fs.existsSync(apiReport)) {
    const apiData = JSON.parse(fs.readFileSync(apiReport, "utf8")) as [
      { descriptor: FunctionDescriptor }
    ];

    //note that it is inaccurate to base the number of functions on snippetsMap as functions with the same name get mapped to the same key,
    //leading to an underestimate of the number of functions
    numFunctions = apiData.length;

    const functionsWithDocComments = apiData.filter(
      (f) => f.descriptor.docComment !== undefined
    );
    numFunctionsWithDocComments = functionsWithDocComments.length;
  }

  if (fs.existsSync(snippetsReport)) {
    const snippetsData = JSON.parse(
      fs.readFileSync(snippetsReport, "utf8")
    ) as [string, string[]][];
    numFunctionsWithExamples = snippetsData
      .map((entry) => entry[1])
      .filter((entry) => entry.length > 0).length;
  }

  return {
    numFunctions,
    numFunctionsWithExamples,
    numFunctionsWithDocComments,
  };
}

/**
 * Finds number of tests that cover at least one statement no other test covers
 * @param tests object containing all tests
 * @returns number of tests that cover at least one statement no other test covers
 */
function getNumUniquelyCoveringTests(tests: ReportForTest[]) {
  const stmtCovMap = new Map(); // map from statement to list of tests covering that statement

  for (const test of tests) {
    for (const coveredStmt of test.coveredStatements ?? []) {
      if (!stmtCovMap.has(coveredStmt)) {
        stmtCovMap.set(coveredStmt, []);
      }
      stmtCovMap.get(coveredStmt).push(test.testName);
    }
  }

  let numUniquelyCoveredStmts = 0;
  const uniquelyCoveringTests = new Set();
  for (const coveringTests of stmtCovMap.values()) {
    if (coveringTests.length == 1) {
      numUniquelyCoveredStmts++;
      uniquelyCoveringTests.add(coveringTests[0]);
    }
  }

  return uniquelyCoveringTests.size;
}
