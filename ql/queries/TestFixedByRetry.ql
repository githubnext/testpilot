/**
 * @name Test fixed after retrying
 * @description Find failing tests that pass after having been refined
 *              with the `RetryWithError` refiner.
 * @kind problem
 */

import AssertionQuality

predicate testFixedByRetry(
  ReportJson report, Prompt orig, GeneratedTest failing, Prompt refined, GeneratedTest passing
) {
  orig = report.getAPrompt() and
  failing = orig.getATest(false, _) and
  refined.isRefinedFrom(orig, failing, "RetryWithError") and
  passing = refined.getATest(true, _)
}

query predicate stats(
  ReportJson report, ErrorCategory errorCategory, int failed, int fixed
) {
  failed = count(GeneratedTest t | t = report.getATest() and t.failsDueTo(errorCategory)) and
  fixed =
    count(GeneratedTest t | testFixedByRetry(report, _, t, _, _) and t.failsDueTo(errorCategory))
}

from Prompt orig, GeneratedTest failing, Prompt refined, GeneratedTest passing
where testFixedByRetry(_, orig, failing, refined, passing)
select failing, "This test was $@ by retrying.", passing, "fixed"
