import javascript
import queries.SnippetMining
import queries.NameBasedCallGraph

/** For this test, we want to mine calls to functions named `target`. */
class FunctionToMine extends TargetFunction {
  FunctionToMine() { this = "target" }
}

/**
 * Looks for a comment of the form `// call #n` in the same file (`path`)
 * and on the same `line` as `invk`, and gets the identifier `#n`.
 */
string getId(InvokeExpr invk, string path, int line) {
  exists(Comment c |
    invk.getLocation().hasLocationInfo(path, _, _, line, _) and
    c.getLocation().hasLocationInfo(path, line, _, _, _) and
    result = c.getText().regexpFind("(?<=call )#\\d+", _, _)
  )
}

/**
 * Hold if there is a comment `// relevant to call #n` on the given `line`
 * in the file with the given `path`, and the method call `invk` has identifier
 * `#n`.
 */
predicate expectedRelevantLine(InvokeExpr invk, string path, int line) {
  exists(getId(invk, path, line))
  or
  exists(Comment c |
    c.getLocation().hasLocationInfo(path, line, _, _, _) and
    c.getText().regexpMatch(".*relevant to call .*" + getId(invk, _, _) + ".*")
  )
}

from InvokeExpr invk, string path, int line, string msg
where
  relevantLine(invk, path, line) and
  not expectedRelevantLine(invk, path, line) and
  msg = "unexpected relevant line"
  or
  not relevantLine(invk, path, line) and
  expectedRelevantLine(invk, path, line) and
  msg = "missing relevant line"
select invk, msg, path, line
