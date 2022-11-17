/***
 * Create a unique statement id from path and start/end location for a given statement
 */
export function createUniqueStmtId(
  relpath: string,
  startLine: number,
  startColumn: number,
  endLine: number,
  endColumn: number
) {
  return `${relpath}@${startLine}:${startColumn}-${endLine}:${endColumn}`;
}

/**
 * Get a map from statement index to unique statement id for a given file in the coverage report
 * @param recordedStmtMap: the statement map recorded in the coverage report
 * @param fileRelPath: the relative path of the file in the coverage report
 * @returns a map from statement index to unique statement id (in same format as createUniqueStmtId)
 */
export function getFileStmts(recordedStmtMap: any, fileRelPath: string) {
  const statementMap = new Map<string, string>();
  for (const key of Object.keys(recordedStmtMap)) {
    const {
      start: { line: startLine, column: startColumn },
      end: { line: endLine, column: endColumn },
    } = recordedStmtMap[key];
    const statementId = createUniqueStmtId(
      fileRelPath,
      startLine,
      startColumn,
      endLine,
      endColumn
    );
    statementMap.set(key, statementId);
  }
  return statementMap;
}

/**
 * Get the list of statements covered from a given file in the coverage report
 * @param fileCoverage: the coverage report for a given file
 * @param relpath: the relative path of the file in the coverage report
 * @returns a list of covered statements (in same format as createUniqueStmtId)
 */
export function getCoveredStmtsForFile(fileCoverage: any, relpath: string) {
  const statementMap = getFileStmts(fileCoverage.statementMap, relpath);
  const coveredStmtIds = [];
  for (const stmtIndx of Object.keys(fileCoverage.s)) {
    const isCovered = fileCoverage.s[stmtIndx];
    if (isCovered) {
      coveredStmtIds.push(statementMap.get(stmtIndx)!);
    }
  }
  return coveredStmtIds;
}
