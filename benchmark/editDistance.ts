import * as fs from "fs";
import levenshtein from "levenshtein";
import fg from "fast-glob";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

export interface Test {
  fileName: string; // in what file was the test found
  index: number; // the index of the test in the file
  contents: string; // the contents of the test
}

export interface SimilarityReportEntry {
  generatedTestName: string;
  generatedTestCode: string;
  mostSimilarTest: Test;
  similarity: number;
}

export interface SimilarityReport {
  numGeneratedTests: number;
  numExistingTests: number;
  similarities: SimilarityReportEntry[];
  maxSimilarity: number;
}

const testLoc: { [key: string]: string } = {
  glob: "test",
  "fs-extra": "lib/**/__tests__",
  "graceful-fs": "test",
  jsonfile: "test",
  bluebird: "test",
  q: "spec",
  rsvp: "test",
  memfs: "src/__tests__",
  "node-dir": "test",
  "zip-a-folder": "test",
  "js-sdsl": "test",
  "quill-delta": "test",
  "complex.js": "tests",
  "pull-stream": "test",
  "countries-and-timezones": "test",
  "simple-statistics": "test",
  plural: "test.js",
  dirty: "test",
  "geo-point": "src/geo-point.spec.ts",
  uneval: "test.js",
  omnitool: "test",
  core: "test",
  "image-downloader": "test",
  "crawler-url-parser": "test",
  "gitlab-js": "test",
};

/**
 * Parse a file and return all tests in it
 * @param fileName the name of the file
 * @param contents the contents of the file
 * @returns the set of tests in the file
 **/
export function parseTests(fileName: string, contents: string): Set<Test> {
  const tests = new Set<Test>();

  const callToIt = /\b(it|test)\s*\(\s*['`"].*['`"],/g; // pattern specifying where a tests starts, including its it description

  // find all index positions where this regexp matches and then figure out where it ends by counting parentheses and curly braces
  let match;
  while ((match = callToIt.exec(contents))) {
    const index = match.index;

    // find index of open curly brace defining test body, ignoring any open curly braces in the test description
    const indexToStartSearch = index + match[0].length;
    const openCurlyBraceIndex = contents.indexOf("{", indexToStartSearch);

    if (openCurlyBraceIndex === -1) {
      console.warn(
        "WARNING: No open curly brace found for test starting at index " +
          index +
          " in file " +
          fileName +
          ". Skipping test."
      );
      continue;
    }

    // find index of matching closing curly brace
    let openCurlyBraces = 1;
    let closeCurlyBraceIndex = openCurlyBraceIndex;
    for (let i = openCurlyBraceIndex + 1; i < contents.length; i++) {
      if (contents[i] === "{") {
        openCurlyBraces++;
      } else if (contents[i] === "}") {
        openCurlyBraces--;
        if (openCurlyBraces === 0) {
          closeCurlyBraceIndex = i;
          break;
        }
      }
    }
    // find index of matching closing parenthesis
    for (let i = closeCurlyBraceIndex + 1; i < contents.length; i++) {
      if (contents[i] === ")") {
        closeCurlyBraceIndex = i;
        break;
      }
    }

    const testCode = contents.substring(index, closeCurlyBraceIndex + 1);

    tests.add({ fileName: fileName, index: tests.size, contents: testCode });
  }

  return tests;
}

/**
 * find all tests in a directory and its subdirectories
 * @param patterns the files and directories to search, specified as a glob pattern
 * @returns an array of test names
 */
export function findTests(
  pkgName: string,
  testDir: string,
  isGenerated: boolean = false
): Set<Test> {
  var testFilePatterns = "tests/*.js";

  if (!isGenerated) {
    testFilePatterns = testLoc[pkgName];

    testFilePatterns =
      testFilePatterns.endsWith(".ts") || testFilePatterns.endsWith(".js")
        ? testFilePatterns
        : testFilePatterns + "/**/*.(js|ts)";
  }

  const tests = new Set<Test>();
  const testFiles = fg.sync(`${testDir}/${testFilePatterns}`, { dot: true });

  testFiles.forEach((f) => {
    const contents = fs.readFileSync(`${f}`, "utf8");
    const fileTests = parseTests(f, contents);
    fileTests.forEach((t) => tests.add(t));
  });
  return tests;
}

/**
 * Generate a report on the similarity of tests in two directories
 * @param existingTestsPatterns glob pattern of paths of existing tests
 * @param generatedTestsPatterns glob pattern of paths of generated tests
 */
export function generateReport(
  pkgName: string,
  existingTestsDir: string,
  generatedTestsDir: string
): SimilarityReport {
  const existingTests = findTests(pkgName, existingTestsDir);
  const generatedTests = findTests(pkgName, generatedTestsDir, true);

  console.log(
    `Found ${existingTests.size} existing tests and ${generatedTests.size} generated tests.`
  );

  const report = {} as SimilarityReport;
  report.numExistingTests = existingTests.size;
  report.numGeneratedTests = generatedTests.size;
  report.similarities = [];

  var overallMaxSimilarity = 0;

  // for each test in the generated tests, find the maximum similarity to an existing test
  generatedTests.forEach((generatedTest) => {
    let maxSimilarity = 0;
    let mostSimilarTest = {
      fileName: "NOT_FOUND",
      index: -1,
      contents: "NOT_FOUND",
    };
    existingTests.forEach((existingTest) => {
      const similarity =
        1 -
        new levenshtein(generatedTest.contents, existingTest.contents)
          .distance /
          Math.max(generatedTest.contents.length, existingTest.contents.length);
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        mostSimilarTest = existingTest;
      }
    });
    //console.log(`generated test ${generatedTest.fileName} has maximal similarity ${maxSimilarity} to existing test#${mostSimilarTest.index} in ${mostSimilarTest.fileName}`);
    report.similarities.push({
      generatedTestName: generatedTest.fileName,
      generatedTestCode: generatedTest.contents,
      mostSimilarTest: mostSimilarTest,
      similarity: maxSimilarity,
    });

    if (maxSimilarity > overallMaxSimilarity) {
      overallMaxSimilarity = maxSimilarity;
    }
  });

  report.maxSimilarity = overallMaxSimilarity;
  return report;
}

if (require.main === module) {
  (async () => {
    // example usage: node benchmark/editDistance.js --pkgName countries-and-timezones --generatedTestsDir 'results/countries-and-timezones/tests' --existingTestsDir 'bencmarks/countries-and-timezones'
    const parser = yargs(hideBin(process.argv))
      .strict()
      .options({
        generatedTestsDir: {
          type: "string",
          demandOption: true,
          description: "directory where the generated tests are",
        },
        existingTestsDir: {
          type: "string",
          demandOption: true,
          description: "directory where the existing tests are",
        },
        pkgName: {
          type: "string",
          demandOption: true,
          description: "name of the package",
        },
      });

    const argv = await parser.argv;

    const report = generateReport(
      argv.pkgName,
      argv.existingTestsDir,
      argv.generatedTestsDir
    );

    const json = JSON.stringify(report, null, 2);
    fs.writeFileSync("similarityReport.json", json, "utf8");
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
