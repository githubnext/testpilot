import fs from "fs";
import path from "path";
import { ITestReport } from "..";

function formatNum(numerator: number, denominator: number) {
  if (denominator == 0) return "--";
  return `${numerator} (${((numerator / denominator) * 100).toFixed(0)} %)`;
}

type CoverageStats = {
  [packageName: string]: {
    proj: string;
    numPassing: number;
    coverage: number;
    numCoveredStmts: number;
    stmtCovMap: Map<number, string[]>;
  };
};

function parseReports(root: string) {
  const coverageStats: CoverageStats = {};

  for (const proj of fs.readdirSync(root)) {
    const projDir = path.join(root, proj);
    if (!fs.lstatSync(projDir).isDirectory()) continue;

    const stmtCovMap = new Map(); // map from statement to list of tests covering that statement
    const reportData = JSON.parse(
      fs.readFileSync(path.join(projDir, "report.json"), "utf8")
    ) as ITestReport;
    const packageName = reportData.metaData.packageName;
    const numCoveredStmts = reportData.coverage?.total.statements?.covered ?? 0;
    const coverage = reportData.coverage?.total.statements?.pct ?? 0;
    const numPassing = reportData.stats?.nrPasses ?? 0;

    for (const test of reportData.tests) {
      for (const coveredStmt of test.coveredStatements ?? []) {
        if (!stmtCovMap.has(coveredStmt)) {
          stmtCovMap.set(coveredStmt, []);
        }
        stmtCovMap.get(coveredStmt).push(test.testName);
      }
    }

    coverageStats[packageName] = {
      proj,
      numPassing,
      coverage,
      numCoveredStmts,
      stmtCovMap,
    };
  }
  return coverageStats;
}

function printTestDiversityReport(title: string, coverageStats: CoverageStats) {
  console.log(`
# ${title}

Project| # Passing Tests| Coverage | # Covered Stmts | Avg. num tests/stmt | # Uniquely Covered Stmts | # Uniquely Covering Tests
--- | ---: | ---: | ---: | ---: | ---: | ---:`);

  for (const {
    proj,
    numPassing,
    coverage,
    numCoveredStmts,
    stmtCovMap,
  } of Object.values(coverageStats)) {
    const coveringTestPerStmt = Array.from(stmtCovMap.values());
    const averageTestsPerStmt = (
      coveringTestPerStmt
        .map((coveringTests) => coveringTests.length)
        .reduce((a, b) => a + b, 0) / coveringTestPerStmt.length
    ).toFixed(2);

    let numUniquelyCoveredStmts = 0;
    const uniquelyCoveringTests = new Set();
    for (const coveringTests of stmtCovMap.values()) {
      if (coveringTests.length == 1) {
        numUniquelyCoveredStmts++;
        uniquelyCoveringTests.add(coveringTests[0]);
      }
    }
    const numUniquelyCoveringTests = formatNum(
      uniquelyCoveringTests.size,
      numPassing
    );

    console.log(
      `${proj}| ${numPassing} | ${coverage}% | ${numCoveredStmts} | ${averageTestsPerStmt} |  ${numUniquelyCoveredStmts} | ${numUniquelyCoveringTests}`
    );
  }

  console.log(`Interpreting table:
  - First three columns are the same as the typical table we output
  - \# Covered stmts: the number of statements covered by the passing tests, from the report.json file
  - Avg num tests/stmt: for each covered statement, we find the tests that cover this statement and then calculate the average num of tests/stmt
  - \# Uniquely Covered Stmts: these are statements covered by only one test
  - \# Uniquely Covering Tests: number of tests that uniquely cover at least one statement (and percentage w.r.t number of passing tests; the higher the percentage the better although 100% is unlikely)
   `);
}

if (require.main === module) {
  if (process.argv.length != 3) {
    console.error("Usage: node generate_diversity_report.js <artifact_dir>");
    process.exit(1);
  }
  const artifactDir = process.argv[2];
  let coverageStats = parseReports(artifactDir);
  printTestDiversityReport(
    "Diversity of Tests w.r.t Stmt Coverage",
    coverageStats
  );
}
