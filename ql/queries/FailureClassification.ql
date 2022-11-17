/**
 * @name Test failure classification
 * @description Classify the cause of test failures.
 * @kind problem
 */

import AssertionQuality

/** Classify reasons for test failure. */
predicate testFailsDueTo(ReportJson report, GeneratedTest failing, ErrorCategory errorCategory) {
  failing = report.getATest() and
  failing.failsDueTo(errorCategory)
}

/** Compute statistics about reasons for test failure. */
query predicate stats(ReportJson report, ErrorCategory category, int numFailed) {
  numFailed = count(GeneratedTest t | testFailsDueTo(report, t, category))
}

/**
 * Consistency check: a test should be assigned a single error category iff it
 * fails.
 *
 * This predicate should be empty.
 */
query predicate check(GeneratedTest t, string problem) {
  t.fails() and
  exists(int n | n = count(ErrorCategory err | t.failsDueTo(err)) |
    n != 1 and
    problem = "Test fails, but is assigned " + n + " error categories instead of one."
  )
  or
  not t.fails() and
  exists(ErrorCategory err | t.failsDueTo(err) |
    problem = "Test does not fail, but is assigned error category " + err.toString() + "."
  )
}

from GeneratedTest failing, ErrorCategory errorCategory
where testFailsDueTo(_, failing, errorCategory)
select failing, "This test fails due to " + errorCategory + "."
