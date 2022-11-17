import { ICoverageSummary } from "./coverage";
import { Prompt } from "./promptCrafting";

export enum TestStatus {
  PASSED = "PASSED",
  FAILED = "FAILED",
  PENDING = "PENDING",
  OTHER = "OTHER",
}

export type TestOutcome =
  | { status: "PASSED"; coverageReport?: string; coverageData?: string }
  | { status: "PENDING" | "OTHER" }
  | { status: "FAILED"; err: ITestFailureInfo };

export namespace TestOutcome {
  export function PASSED(
    coverageReport?: string,
    coverageData?: string
  ): TestOutcome {
    return { status: "PASSED", coverageReport, coverageData };
  }
  export const PENDING: TestOutcome = { status: "PENDING" };
  export const OTHER: TestOutcome = { status: "OTHER" };
  export function FAILED(err: ITestFailureInfo): TestOutcome {
    return { status: "FAILED", err };
  }
}

export interface ITestFailureInfo {
  message: string;
  code?: string;
  stack?: string;
}

/**
 * Represents a test and all associated information
 */
export interface ITestInfo {
  /** The numeric ID of the test. */
  id: number;
  /** The name of the test (constructed from the ID). */
  testName: string;
  /** The outcome of the test. */
  outcome: TestOutcome;
  /** The name of the file containing the test. */
  testSource: string;
  /** The prompts that gave rise to this test. */
  prompts: Prompt[];
  /** The API method for which this test was generated. */
  api: string;
}

/**
 * Represents the metadata associated with a generated test suite
 */
export interface IMetaData {
  /** The name of the package under test. */
  packageName: string;
  /** Whether usage snippets were mined from documentation. */
  useDocSnippets: boolean;
  /** Whether usage snippets were mined from code. */
  useCodeSnippets: boolean;
  /** The maximum number of snippets to include in a prompt, or "all" if no limit was imposed. */
  numSnippets: number | "all";
  /** The maximum length of each snippet in lines. */
  snippetLength: number;
  /** The number of completions to obtain for each prompt. */
  numCompletions: number;
}

export type ReportForTest = {
  /** name of the test */
  testName: string;
  /** API method for which the test was generated */
  api: string;
  /** name of the file containing the test */
  testFile: string;
  /** IDs of the prompts that gave rise to the test */
  promptIds: number[];
  /** status of the test */
  status: TestStatus;
  /** error information if the test failed */
  err: ITestFailureInfo | {};
  /** statements covered by the test */
  coveredStatements: string[];
  /** duration of the test, if known */
  duration: number | undefined;
};

/**
 * Represents all test results, statistics, prompts, completions, and coverage information
 * associated with a generated test suite
 */
export interface ITestReport {
  metaData: IMetaData;
  /** total number of unique snippets available in the snippet map. */
  nrUniqueSnippets: number;
  stats: {
    /** total number of tests */
    nrTests: number;
    /** number of passing tests */
    nrPasses: number;
    /** number of failing tests */
    nrFailures: number;
    /** number of pending tests */
    nrPending: number;
    /** number of other tests */
    nrOther: number;
    /** time taken to explore package API */
    apiExplorationTime: number;
    /** time taken to extract doc comments */
    docCommentExtractionTime: number;
    /** time taken to extract snippets */
    snippetExtractionTime: number;
    /** cumulative response time for all Codex queries */
    codexQueryTime: number;
    /** end-to-end wall-clock time (in milliseconds) taken to generate the test suite */
    totalTime: number;
    /** number of tests containing at least one non-trivial assertion */
    nrNonTrivialTests?: number;
    /** number of passing tests containing at least one non-trivial assertion */
    nrNonTrivialPasses?: number;
  };
  tests: ReportForTest[];
  coverage: ICoverageSummary;
}
