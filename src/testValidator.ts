import { ICoverageSummary } from "./coverage";
import { TestOutcome } from "./report";

export abstract class TestValidator {
  /** Validate the given test, determining whether it passes or not. */
  public abstract validateTest(
    testName: string,
    testSource: string
  ): TestOutcome;

  /** Compute a coverage summary for all passing tests this validator has seen. */
  public abstract computeCoverageSummary(): ICoverageSummary;

  /** Clean up any temporary data this validator has accumulated. */
  public cleanup(): void {}
}
