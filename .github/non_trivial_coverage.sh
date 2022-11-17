#! /bin/bash

set -e
MY_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Usage: non_trivial_coverage.sh <report_dir>
if [ $# -ne 1 ] || [ ! -d "$1" ] || [ "$1" == "-h" ] || [ "$1" == "--help" ]; then
  echo "Usage: $0 <report_dir>"
  echo "  report_dir: Directory containing coverage reports"
  echo
  echo "This script identifies non-trivial tests and adds corresponding coverage information to the report."
  exit 1
fi
report_dir=$1
output=$1/report.json

if [ ! -f $output ]; then
  echo "No coverage report found at $output"
  exit 1
fi

dbdir=`mktemp -d`
trap "rm -rf $dbdir" EXIT

echo "Creating database in $dbdir..."
# make sure there is at least one JavaScript file to avoid extractor error
echo ';' >$report_dir/dummy.js
LGTM_INDEX_FILTERS='include:**/*.json
exclude:**/coverageData/**/*.json' codeql database create -l javascript -s $report_dir $dbdir

echo "Running query for identifying non-trivial tests..."
codeql query run --output $dbdir/TrivialTest.bqrs -d $dbdir $MY_DIR/../ql/queries/TrivialTest.ql

echo "Marking non-trivial tests and computing coverage information..."
codeql bqrs decode --format csv --no-titles $dbdir/TrivialTest.bqrs | sed 's/"//g' | cut -d, -f1 | xargs -r -n 1 basename >$dbdir/trivial_tests.txt
node <<EOF
const fs = require('fs');
const path = require('path');

const trivialTests = fs.readFileSync('$dbdir/trivial_tests.txt', 'utf8').split('\n');
const report = JSON.parse(fs.readFileSync('$output', 'utf8'));

let nonTrivialTests = 0, nonTrivialPassingTests = 0;
const nonTriviallyCoveredStatements = new Set();
for (const test of report.tests) {
  test.isTrivial = trivialTests.includes(test.testFile);
  if (!test.isTrivial) {
    nonTrivialTests++;
    if (test.status === 'PASSED') {
      nonTrivialPassingTests++;
      for (const statement of test.coveredStatements) {
        nonTriviallyCoveredStatements.add(statement);
      }
    }
  }
}
report.stats.nrNonTrivialTests = nonTrivialTests;
report.stats.nrNonTrivialPasses = nonTrivialPassingTests;
report.coverage.total.statements.nonTrivialCovered = nonTriviallyCoveredStatements.size;
report.coverage.total.statements.nonTrivialPct = Math.floor(nonTriviallyCoveredStatements.size / report.coverage.total.statements.total * 10000) / 100;
fs.writeFileSync('$output', JSON.stringify(report, null, 2));
EOF

echo "Running query for computing per-refiner statistics..."
codeql query run --output $dbdir/RefinerContributions.bqrs -d $dbdir $MY_DIR/../ql/queries/RefinerContributions.ql
codeql bqrs decode --format json $dbdir/RefinerContributions.bqrs | \
  jq '[
    .["#select"].tuples[] |
    {
      "key": .[1],
      "value": {
        "passingTests": .[2],
        "coverage": .[3],
        "nonTrivialCoverage": .[4]
      }
    }
  ] | from_entries' >$1/refiners.json