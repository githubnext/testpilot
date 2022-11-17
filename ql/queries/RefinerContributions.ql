import AssertionQuality

/**
 * A pseudo-refiner, that is, either a concrete refiner, "all" (meaning all
 * refiners), or "none" (meaning no refiners).
 */
class PseudoRefiner extends string {
  PseudoRefiner() {
    this instanceof Refiner or
    this = "all" or
    this = "none"
  }
}

/**
 * Gets a prompt from `report` that does _not_ depend on the given `refiner`.
 *
 * If `refiner` is '"all"', all initial, unrefined prompts (which do not depend
 * on any refiner) are returned.
 * If `refiner` is '"none"', all prompts are returned.
 */
Prompt promptWithout(ReportJson report, PseudoRefiner refiner) {
  result = report.getAPrompt() and
  (
    result.doesNotNeed(refiner)
    or
    refiner = "all" and not result.isRefinedFrom(_, _)
    or
    refiner = "none"
  )
}

GeneratedTest testWithout(
  ReportJson report, PseudoRefiner refiner, boolean passes, boolean nontrivial
) {
  result = promptWithout(report, refiner).getATest(passes, nontrivial)
}

/**
 * Gets the number of passing tests in `report` that do not depend on
 * `refiner`.
 */
int getPassingTestsWithout(ReportJson report, PseudoRefiner refiner) {
  result = count(testWithout(report, refiner, true, _))
}

/**
 * Gets the number of statements covered by passing tests in `report` that do
 * not depend on `refiner`.
 */
int getStatementsCoveredWithout(ReportJson report, PseudoRefiner refiner) {
  result = count(string stmtId | testWithout(report, refiner, true, _).coversStmt(stmtId))
}

/**
 * Gets the number of statements covered by non-trivial passing tests in
 * `report` that do not depend on `refiner`.
 */
int getStatementsNonTriviallyCoveredWithout(ReportJson report, PseudoRefiner refiner) {
  result = count(string stmtId | testWithout(report, refiner, true, true).coversStmt(stmtId))
}

/**
 * Computes a percentage value with two decimal places (using floor, not
 * rounding, for consistency with nyc).
 */
bindingset[numerator, denominator]
float perc(float numerator, float denominator) {
  result = ((numerator / denominator * 100) * 100).floor() / 100.0
}

from
  ReportJson report, string refiner, int numTests, int numStatements, float passingTestPercWithout,
  float coveragePercWithout, float nonTrivialCoveragePercWithout
where
  numTests = report.getNumberOfTests() and
  numStatements = report.getNumberOfStatements() and
  passingTestPercWithout = perc(getPassingTestsWithout(report, refiner), numTests) and
  coveragePercWithout = perc(getStatementsCoveredWithout(report, refiner), numStatements) and
  nonTrivialCoveragePercWithout =
    perc(getStatementsNonTriviallyCoveredWithout(report, refiner), numStatements)
select report, refiner, passingTestPercWithout, coveragePercWithout, nonTrivialCoveragePercWithout
