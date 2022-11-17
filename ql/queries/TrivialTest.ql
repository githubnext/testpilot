/**
 * @name Trivial test
 * @description Highlight tests that do not contain non-trivial assertions.
 */

import AssertionQuality

from GeneratedTest t, string reason
where
  not exists(AssertionInGeneratedTest a | a.getFile() = t and a.isNonTrivial()) and
  (
    if exists(AssertionInGeneratedTest a | a.getFile() = t)
    then reason = "only trivial assertions"
    else reason = "no assertions"
  )
select t, "Test contains " + reason + "."
