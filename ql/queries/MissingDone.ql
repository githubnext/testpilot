/**
 * @name Test failure due to missing `done` callback
 * @description Find tests that fail because they do not call the `done`
 *              callback.
 * @kind problem
 */

import AssertionQuality

class TimedOutTest extends GeneratedTest {
  TimedOutTest() { this.failsDueTo("TimeoutError") }

  predicate isMissingDone() {
    exists(DataFlow::ParameterNode done |
      done = DataFlow::globalVarRef("it").getACall().getABoundCallbackParameter(1, 0) and
      done.getFile() = this and
      not exists(done.getACall())
    )
  }
}

query predicate stats(ReportJson report, int totalFailed, int totalTimeout, int totalMissingDone) {
  totalFailed = count(GeneratedTest t | t = report.getATest() and t.fails()) and
  totalTimeout = count(TimedOutTest t | t = report.getATest()) and
  totalMissingDone = count(TimedOutTest t | t = report.getATest() and t.isMissingDone())
}

from TimedOutTest t
where t.isMissingDone()
select t, "Test failure due to missing call to `done`."
