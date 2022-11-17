import { performance, PerformanceObserver } from "perf_hooks";
import { CodexPostOptions } from "..";

export class PerformanceMeasurer {
  /** Time stamp when this measurer was instantiated. */
  private readonly start: number;

  /** Time to explore package API, in milliseconds (includes time to extract doc comments). */
  private apiExplorationTime: number | undefined = undefined;

  /** Time to extract doc comments, in milliseconds. */
  private docCommentExtractionTime: number | undefined = undefined;

  /** Time to extract snippets, in milliseconds. */
  private snippetExtractionTime: number | undefined = undefined;

  /** Runtimes for generated tests in milliseconds. */
  private readonly testDurations: Map<string, number> = new Map();

  /**
   * Response times for requests to the Codex model together with the
   * corresponding request options.
   */
  private readonly codexQueryTimes: [CodexPostOptions, number][] = [];

  /** An observer for performance measurements. */
  private readonly observer = new PerformanceObserver((entries) => {
    for (const entry of entries.getEntries()) {
      if (entry.name.startsWith("duration:")) {
        // for each test `test_i.js`, we get a performance measurement `duration:test_i.js`
        const testName = entry.name.substring("duration:".length);
        if (this.testDurations.has(testName)) {
          console.warn(`Multiple durations for test ${testName}`);
        }
        this.testDurations.set(testName, entry.duration);
      } else if (entry.name.startsWith("codex-query:")) {
        // for each Codex query, we get a performance measurement `codex-query:<options>`
        const options = JSON.parse(entry.name.substring("codex-query:".length));
        // remove `logit_bias` property; it's an internal workaround
        delete options.logit_bias;
        this.codexQueryTimes.push([options, entry.duration]);
      } else if (entry.name === "snippet-extraction") {
        this.snippetExtractionTime = entry.duration;
      } else if (entry.name === "doc-comment-extraction") {
        if (this.docCommentExtractionTime === undefined) {
          this.docCommentExtractionTime = entry.duration;
        } else {
          this.docCommentExtractionTime += entry.duration;
        }
      } else if (entry.name === "api-exploration") {
        this.apiExplorationTime = entry.duration;
      }
    }
  });

  constructor() {
    this.start = performance.now();
    this.observer.observe({ entryTypes: ["measure"] });
  }

  /**
   * Get the time (in milliseconds) taken to explore package API, not
   * including time to extract doc comments.
   */
  getApiExplorationTime(): number | undefined {
    if (this.apiExplorationTime && this.docCommentExtractionTime) {
      return Math.max(
        0,
        this.apiExplorationTime - this.docCommentExtractionTime
      );
    }
    return this.apiExplorationTime;
  }

  /** Get the time (in milliseconds) taken to extract doc comments. */
  getDocCommentExtractionTime(): number | undefined {
    return this.docCommentExtractionTime;
  }

  /** Get the time (in milliseconds) taken to extract snippets. */
  getSnippetExtractionTime(): number | undefined {
    return this.snippetExtractionTime;
  }

  /** Get the time (in milliseconds) taken to run the given test. */
  getTestDuration(testName: string): number | undefined {
    return this.testDurations.get(testName);
  }

  /**
   * Get a list of response times (in milliseconds) for Codex queries
   * together with the corresponding request parameters.
   */
  getCodexQueryTimes(): [CodexPostOptions, number][] {
    return this.codexQueryTimes;
  }

  /** Get the cumulative response time (in milliseconds) for all Codex queries. */
  getTotalCodexQueryTime(): number {
    return this.codexQueryTimes.reduce(
      (sum, [, duration]) => sum + duration,
      0
    );
  }

  /** Get the total elapsed time (in milliseconds) since this measurer was instantiated. */
  getTotalTime(): number {
    return performance.now() - this.start;
  }
}
