/**
 * @name Unhelpful refinement
 * @description Find a prompt refinement where the original prompt produced
 *              a test that passed, but the refined prompt does not.
 * @kind problem
 */

import AssertionQuality

predicate unhelpfulRefinement(
  ReportJson report, Refiner refiner, Prompt orig, GeneratedTest passing, Prompt refined
) {
  orig = report.getAPrompt() and
  passing = orig.getATest(true, true) and
  refined.isRefinedFrom(orig, refiner) and
  not exists(refined.getATest(true, _))
}

query predicate stats(string package, string refiner, int totalRefinements, int totalUnhelpful, float ratio) {
  exists(ReportJson report | package = report.getPackageName() |
    totalRefinements = strictcount(Prompt p | p = report.getAPrompt() and p.isRefinedFrom(_, refiner)) and
    totalUnhelpful = count(Prompt p | unhelpfulRefinement(report, refiner, p, _, _)) and
    ratio = totalUnhelpful.(float) / totalRefinements
  )
  or
  package = "all" and
  totalRefinements = strictcount(Prompt p | p.isRefinedFrom(_, refiner)) and
  totalUnhelpful = count(Prompt p | unhelpfulRefinement(_, refiner, p, _, _)) and
  ratio = totalUnhelpful.(float) / totalRefinements
  or
  refiner = "any" and
  package = "all" and
  totalRefinements = strictcount(Prompt p | p.isRefinedFrom(_, _)) and
  totalUnhelpful = count(Prompt p | unhelpfulRefinement(_, _, p, _, _)) and
  ratio = totalUnhelpful.(float) / totalRefinements
}

from Prompt orig, GeneratedTest passing, Refiner refiner, Prompt refined
where unhelpfulRefinement(_, refiner, orig, passing, refined)
select orig,
  "This prompt produced a $@, but after $@ with " + refiner +
    " only failing tests were produced, for example $@.", passing, "passing test", refined,
  "refining", refined.getATest(false, _), "this one"
