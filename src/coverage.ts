/**
 * Represents the coverage information associated with each "category" of
 * coverage (e.g., "statements", "branches", "functions", "lines")
 */
interface ICoverageCategoryStats {
  total: number;
  covered: number;
  skipped: number;
  pct: number;
  nonTrivialPct?: number;
}

/**
 * Represents the coverage information associated with a generated test suite,
 * consisting of the coverage information for each "category" of coverage
 * (e.g., "statements", "branches", "functions", "lines")
 */
export interface ICoverageStats {
  lines: ICoverageCategoryStats;
  statements: ICoverageCategoryStats;
  functions: ICoverageCategoryStats;
  branches: ICoverageCategoryStats;
  branchesTrue: ICoverageCategoryStats;
}

/**
 * Represents a summary of the coverage information associated with a generated test suite,
 * consisting of both the total coverage information, and similar information on a per-file basis
 */
export interface ICoverageSummary {
  total: ICoverageStats;
  [file: string]: ICoverageStats;
}

/**
 * An empty coverage summary object
 */
export function emptyCoverageSummary(): ICoverageSummary {
  return {
    total: {
      lines: { total: 0, covered: 0, skipped: 0, pct: 0 },
      statements: { total: 0, covered: 0, skipped: 0, pct: 0 },
      functions: { total: 0, covered: 0, skipped: 0, pct: 0 },
      branches: { total: 0, covered: 0, skipped: 0, pct: 0 },
      branchesTrue: { total: 0, covered: 0, skipped: 0, pct: 0 },
    },
  };
}
