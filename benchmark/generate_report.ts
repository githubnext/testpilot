import fs from "fs";
import {
  CoverageStats,
  FailureStats,
  parseReports,
  RefinerStats,
  SimilarityStats,
} from "./parse_reports";

function percentage(p: number | string) {
  if (typeof p === "number") {
    return `${p.toFixed(2)}%`;
  } else {
    return p;
  }
}

type DiffCoverageStats = {
  [packageName: string]: { [key: keyof CoverageStats]: string | number };
};

function printCoverageReport(
  title: string,
  stats: CoverageStats | DiffCoverageStats
) {
  console.log(`
# ${title}
Project | # Snippets Available | # Tests | # Passing Tests |  Statement coverage | # Non-trivial tests | # Non-trivial passing tests | Statement coverage by non-trivial tests
--- |  --: | --: | --: | --: | --: | --: | --:`);
  for (const {
    proj,
    nrUniqueSnippets,
    numTests,
    numPassing,
    coverage,
    nonTrivialTests,
    nonTrivialPassing,
    nonTrivialCoverage,
  } of Object.values(stats)) {
    console.log(
      `${proj} | ${nrUniqueSnippets} | ${numTests} | ${numPassing} | ${percentage(
        coverage
      )} | ${nonTrivialTests} | ${nonTrivialPassing} | ${percentage(
        nonTrivialCoverage
      )}`
    );
  }
}

function printFailureReport(
  title: string,
  stats: FailureStats,
  showPercentages = true
) {
  console.log(`
# ${title}
Project | # FailedTests | # AssertionErrors | # FileSysErrors | # CorrectnessErrors |  # Timeout | # Other
--- |  --: | --: | --: | --: | --: | --:|`);
  for (const {
    proj,
    numFailing,
    numAssertionErrors,
    numFileSysErrors,
    numCorrectnessErrors,
    numTimeoutErrors,
    numOther,
  } of Object.values(stats)) {
    console.log(
      `${proj} | ${numFailing} | ${formatNum(
        numAssertionErrors,
        numFailing,
        showPercentages
      )} | ${formatNum(
        numFileSysErrors,
        numFailing,
        showPercentages
      )} | ${formatNum(
        numCorrectnessErrors,
        numFailing,
        showPercentages
      )} | ${formatNum(
        numTimeoutErrors,
        numFailing,
        showPercentages
      )} | ${formatNum(numOther, numFailing, showPercentages)}`
    );
  }
}

function printRefinerReport(title: string, stats: RefinerStats) {
  const refinerNames = Array.from(stats.refinerNames).sort();
  console.log(`
# ${title}
Project | ${refinerNames.join(" | ")}
--- | ${"--: |".repeat(refinerNames.length)}`);
  for (const { proj, refinersData } of Object.values(stats.stats)) {
    if (!proj) continue;
    console.log(
      `${proj} | ${refinerNames
        .map((name) =>
          name in refinersData ? refinersData[name].coverage + "%" : "--"
        )
        .join(" | ")}`
    );
  }
}

function printSimilarityReport(title: string, stats: SimilarityStats) {
  console.log(`
# ${title}
Project | numGeneratedTests | numExistingTests | maxSimilarity
--- |  --: | --: | --:`);

  for (const { proj, similarityReport } of Object.values(stats)) {
    console.log(
      `${proj} | ${similarityReport.numGeneratedTests} | ${similarityReport.numExistingTests} | ${similarityReport.maxSimilarity}`
    );
  }
}

function formatNum(
  number: number,
  denominator: number,
  showPercentages = true
) {
  if (denominator == 0) return "--";
  if (showPercentages)
    return `${number} (${((number / denominator) * 100).toFixed(2)}%)`;
  else return `${number}`;
}

function coverageDiff(cov1: number | "unknown", cov2: number | "unknown") {
  if (cov1 === "unknown" || cov2 === "unknown") {
    return "unknown";
  } else {
    return (cov1 - cov2).toFixed(2);
  }
}

function compareCovToBaseline(baselineCovStats: CoverageStats) {
  const diffStats: DiffCoverageStats = {};
  for (const [packageName, projStats] of Object.entries(coverageStats)) {
    const baseline = baselineCovStats[packageName];

    // print diff if the same config is in the baseline, otherwise, skip diff for this config
    if (baseline) {
      const nonTrivialTestDiff =
        projStats.nonTrivialTests - baseline.nonTrivialTests;
      const nonTrivialPassingDiff =
        projStats.nonTrivialPassing - baseline.nonTrivialPassing;
      diffStats[packageName] = {
        proj: projStats.proj,
        nrUniqueSnippets: ppDiff(
          projStats.nrUniqueSnippets - baseline.nrUniqueSnippets
        ),
        numTests: ppDiff(projStats.numTests - baseline.numTests),
        numPassing: ppDiff(projStats.numPassing - baseline.numPassing),
        coverage: ppDiff(
          coverageDiff(projStats.stmtCoverage, baseline.stmtCoverage)
        ),
        nonTrivialTests: ppDiff(nonTrivialTestDiff),
        nonTrivialPassing: ppDiff(nonTrivialPassingDiff),
        nonTrivialCoverage: ppDiff(
          coverageDiff(
            projStats.nonTrivialCoverage,
            baseline.nonTrivialCoverage
          )
        ),
      };
    }
  }
  printCoverageReport("Coverage Comparison to baseline", diffStats);
}

function compareFailuresToBaseline(baselineFailureStats: any) {
  const diffStats: any = {};
  for (const [packageName, projStats] of Object.entries(failureStats)) {
    const baseline = baselineFailureStats[packageName];

    //print diff if the same config is in the baseline, otherwise, skip diff for this config
    if (baseline) {
      diffStats[packageName] = {
        proj: projStats.proj,
        numFailing: ppDiff(projStats.numFailing - baseline.numFailing, true),
        numAssertionErrors: ppDiff(
          projStats.numAssertionErrors - baseline.numAssertionErrors
        ),
        numFileSysErrors: ppDiff(
          projStats.numFileSysErrors - baseline.numFileSysErrors
        ),
        numCorrectnessErrors: ppDiff(
          projStats.numCorrectnessErrors - baseline.numCorrectnessErrors
        ),
        numTimeoutErrors: ppDiff(
          projStats.numTimeoutErrors - baseline.numTimeoutErrors
        ),
        numOther: ppDiff(projStats.numOther - baseline.numOther),
      };
    }
  }
  printFailureReport("Failure Comparison to baseline", diffStats, false);
}

function ppDiff(d: number | string, lowerIsBetter = false) {
  let s;
  if (d > 0) {
    s = `+${d}`;
  } else if (d == 0) {
    s = "±0";
  } else {
    s = String(d);
  }
  if (lowerIsBetter ? d < 0 : d > 0) {
    return `**${s}**`;
  } else {
    return s;
  }
}

if (process.argv.length < 3 || process.argv.length > 5) {
  console.error(
    "Usage: node generate_report.js [<config.json>] <artifact_dir> [<baseline_artifact_dir>]"
  );
  process.exit(1);
}
const hasConfig = fs.lstatSync(process.argv[2]).isFile();
const config = hasConfig
  ? JSON.parse(fs.readFileSync(process.argv[2], "utf8"))
  : {};
const artifactDir = hasConfig ? process.argv[3] : process.argv[2];
const baselineArtifactDir = hasConfig ? process.argv[4] : process.argv[3];

console.log(`
# Parameters
- snippets from: ${config.snippetsFrom}
- snippet length: ${config.snippetLength}
- numSnippets: ${config.numSnippets}
- temperatures: ${config.temperatures}
- number of completions: ${config.numCompletions}`);

const { coverageStats, failureStats, refinersStats, similarityStats } =
  parseReports(artifactDir);

printCoverageReport("Coverage report", coverageStats);
printFailureReport("Failure report", failureStats);
printRefinerReport("Coverage when excluding refiners", refinersStats);
printSimilarityReport(
  "Similarity of generated tests to existing tests",
  similarityStats
);

if (baselineArtifactDir) {
  const baselineResults = parseReports(baselineArtifactDir);
  const baselineCovStats = baselineResults.coverageStats;
  const baselineFailureStats = baselineResults.failureStats;
  compareCovToBaseline(baselineCovStats);
  compareFailuresToBaseline(baselineFailureStats);
}
