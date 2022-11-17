import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import * as fs from "fs";
import { Snippets } from "./snippetHelper";
import { API, exploreAPI } from "./exploreAPI";
import * as path from "path";

var jsExtensions = require("common-js-file-extensions");

const snippetHelper = new Snippets();

interface ISnippetsPerMethod {
  method: string;
  snippets: string[];
}

interface IPkgSnippetInfo {
  numMethods: number;
  numMethodsWithEg: number;
  totalSnippets: number;
  snippetsPerMethod: ISnippetsPerMethod[];
}

function emptyPkgSnippetInfo(): IPkgSnippetInfo {
  return {
    numMethods: 0,
    numMethodsWithEg: 0,
    totalSnippets: 0,
    snippetsPerMethod: [],
  };
}
/**
 * Get code file contents for use as snippets
 * @param files set of code files to extract snippets from
 * @returns a set of snippets in the given code files
 */
function getSnippetsFromCodeFiles(files: Set<string>): Set<string> {
  let snippets = new Set<string>();
  files.forEach((file) => snippets.add(fs.readFileSync(file, "utf8")));

  return snippets;
}

/**
 * Mine snippets from fenced code blocks in markdown files and example JS files and return as JSON.
 * @param dirName the directory in which to search
 * @param numSnippets the number of snippets to mine
 * @param methods array of methods to extract usage snippets for
 * @param maxLength The maximum number of lines to include in each snippet.
 * @returns a stringified JSON object containing the mined snippets and stats about the mined snippets
 */
export function getDocSnippetsAsJson(
  dirName: string,
  numSnippets: number,
  methods: string[],
  maxLength: number
): string {
  const result = getDocSnippets(dirName, numSnippets, methods, maxLength);
  let allPkgSnippets = new Set<string>();
  let structuredResult = emptyPkgSnippetInfo();
  structuredResult.numMethods = methods.length;

  result.forEach((snippets: string[], method: string) => {
    snippets.forEach(allPkgSnippets.add, allPkgSnippets);
    if (snippets.length > 0) structuredResult.numMethodsWithEg += 1;

    const snippResults: ISnippetsPerMethod = {
      method: method,
      snippets: snippets,
    };
    structuredResult.snippetsPerMethod.push(snippResults);
  });

  structuredResult.totalSnippets = allPkgSnippets.size;

  return JSON.stringify(structuredResult, null, 2);
}

/**
 * Mine snippets from fenced code blocks in markdown files.
 * @param dirName the directory in which to search
 * @param numSnippets the maximum number of snippets to mine per method, or "all" to mine all snippets
 * @param methods array of methods to extract usage snippets for
 * @param maxLength The maximum number of lines to include in each snippet.
 * @returns a map associating a method name to a set of usage snippets for that method
 */
export function getDocSnippets(
  dirName: string,
  numSnippets: number | "all",
  methods: string[],
  maxLength: number
): Map<string, string[]> {
  // find all markdown files in the given directory
  let [mdFiles, exampleCodeFiles] = findExampleFiles(dirName);

  // initialize result; initially each method has an empty set of associated snippets
  let result = new Map<string, string[]>();
  methods.forEach((method) => result.set(method, []));

  // extract snippets from each markdown file
  let snippets = new Set<string>();
  mdFiles.forEach((mdFile) => {
    let codeBlocks = findFencedCodeBlocks(mdFile);
    codeBlocks.forEach((codeBlock) => {
      let extractedSnippets = extractSnippetsFromCodeBlock(
        stripFencing(codeBlock)
      );
      extractedSnippets.forEach((snippet) => {
        // when code blocks contain multiple examples, only the first example may require packages
        // in such cases, we add these requires to the snippets for the remaining examples
        if (hasNoRequires(snippet)) {
          const requires = findAllRequires(codeBlock);
          if (requires.length > 0) {
            snippet = requires + "\n" + snippet;
          }
        }
        snippets.add(snippet);
      });
    });
  });

  getSnippetsFromCodeFiles(exampleCodeFiles).forEach((snippet) =>
    snippets.add(snippet)
  );

  // iterate through all snippets. If a snippet contains a method name,
  // associate it with the set of snippets for that method. Filter out
  // snippets that are less than 2 lines long.
  snippets.forEach((snippet) => {
    const tokens = tokenize(snippet);
    methods.forEach((method) => {
      if (
        tokens.includes(method) &&
        nrLinesInSnippet(snippet) > 1 &&
        callsAPIMethod(snippet, method)
      ) {
        snippet = trimSnippetToMaxLength(snippet, maxLength);
        (result.get(method) as string[]).push(snippet);
      }
    });
  });

  if (numSnippets !== "all") {
    // for each method, select the required number of diverse snippets
    methods.forEach((method) => {
      const allSnippetsForMethod = result.get(method) as string[];
      const selectedSnippets = snippetHelper.selectSnippets(
        new Set<string>(allSnippetsForMethod),
        numSnippets
      );
      result.set(method, Array.from(selectedSnippets));
    });
  }

  return result;
}

/**
 * Find the number of lines in a given snippet
 * @param snippet the snippet
 * @returns the number of lines in the given snippet
 */
function nrLinesInSnippet(snippet: string): number {
  return snippet.split("\n").length;
}

/**
 * Trim a given code snippet to a max number of lines
 * @param snippet the snippet
 * @param maxLength maximum number of lines to inlcude in the snippet
 * @returns the trimmed snippet with only maxLength lines kept
 */
export function trimSnippetToMaxLength(
  snippet: string,
  maxLength: number
): string {
  const lines = snippet.split("\n").slice(0, maxLength);
  return lines.join("\n");
}

/**
 * Make sure the method named is involved in a call
 * @param snippet the snippet
 * @param method the method name
 * @returns true if the method name is involved in a call, false otherwise
 */
export function callsAPIMethod(snippet: string, methodName: string): boolean {
  const lines = snippet.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const regex = new RegExp("\\b" + methodName + "\\(");

    if (lines[i].search(regex) !== -1) {
      return true;
    }
  }
  return false;
}

/**
 * Check if given directory path ends with one the predefined example directories
 * @param dirPath directory path to check
 * @returns true if dirPath ends with one of the predefined example directories, false otherwise
 */
function isExampleDir(dirPath: string): boolean {
  const exampleDirs = ["examples", "example", "demo"];

  return exampleDirs.includes(path.basename(dirPath));
}

/***
 * Check if given file has a JS code file extension
 * @param fileName file name to check
 * @returns true if fileName has JS code file extension, false otherwise
 */
function isJSFile(fileName: string): boolean {
  return jsExtensions.code.includes(path.extname(fileName).slice(1));
}

/**
 * Recursively search for markdown files and example code files in the given directory
 * @param dir the directory to search
 * @returns a set of markdown files and a set of example code files, in the given directory
 **/
function findExampleFiles(directoryName: string): [Set<string>, Set<string>] {
  let markDownFiles = new Set<string>();
  let exampleCodeFiles = new Set<string>();
  try {
    let files = fs.readdirSync(directoryName);
    for (let file of files) {
      let filePath = directoryName + "/" + file;
      if (
        isExampleDir(directoryName) &&
        fs.statSync(filePath).isFile() &&
        isJSFile(filePath)
      ) {
        exampleCodeFiles.add(filePath);
      } else if (fs.statSync(filePath).isFile() && file.endsWith(".md")) {
        markDownFiles.add(filePath);
      } else if (fs.statSync(filePath).isDirectory()) {
        if (directoryName.indexOf("node_modules") === -1) {
          const [newMarkDownFiles, newExampleCodeFiles] =
            findExampleFiles(filePath);
          newMarkDownFiles.forEach((file) => markDownFiles.add(file));
          newExampleCodeFiles.forEach((file) => exampleCodeFiles.add(file));
        }
      }
    }
  } catch (err) {
    console.log(err);
  }
  return [markDownFiles, exampleCodeFiles];
}

/**
 * Find fenced code blocks in a given markdown file
 * @param file the markdown file to search
 * @returns a set of fenced code blocks in the given markdown file
 */
export function findFencedCodeBlocks(fileName: string): Set<string> {
  let codeBlocks = new Set<string>();
  let regExp = /^```[\s\S]*?^```$/gm;
  let fileContents = fs.readFileSync(fileName, "utf8");
  let matches = fileContents.match(regExp);
  if (matches) {
    for (let match of matches) {
      if (
        (match.startsWith("```js") && !match.startsWith("```json")) ||
        match.startsWith("```javascript") ||
        match.startsWith("```ts") ||
        match.startsWith("```typescript") ||
        match.startsWith("```tsx") ||
        match.startsWith("```\n")
      ) {
        codeBlocks.add(match);
      }
    }
  }
  return codeBlocks;
}

/**
 * Tokenize a code block into a list of alphanumeric words, ignoring all other characters.
 * @param code the code block to tokenize
 * @returns a list of tokens in the given code block
 */
function tokenize(code: string): string[] {
  const word = /[a-zA-Z_$][\w$]*/g;
  return code.match(word) || [];
}

/**
 * Remove the first and last line from a fenced code block
 * @param codeBlock the code block to remove the first and last line from
 * @returns the code block with the first and last line removed
 */
function stripFencing(snippet: string): string {
  let lines = snippet.split("\n");
  lines.shift();
  lines.pop();
  return lines.join("\n");
}

/**
 * Remove trailing comments at the end of a snippet (these may arise if
 * code blocks are split when they contain multiple examples.
 * @param snippet the snippet to remove trailing comments from
 * @returns the snippet with trailing comments removed
 */
function removeTrailingComments(snippet: string) {
  let lines = snippet.split("\n");
  while (true) {
    let line = lines.pop() as string;
    if (line.startsWith("//") || line?.length === 0) {
      break;
    }
  }
  return lines.join("\n");
}

/**
 * Sometimes, a fenced code block contains multiple examples. In such cases, we assume that
 * a new snippet is started whenever a previously declared variable is redeclared.
 * @param codeBlock the code block to extract snippets from
 * @returns a set of snippets in the given code block
 */
function extractSnippetsFromCodeBlock(codeBlock: string): Set<string> {
  let snippets = new Set<string>();
  let lines = codeBlock.split("\n");
  let startOfCurrentSnippet = 0;
  let declaredVars = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (
      line.startsWith("let") ||
      line.startsWith("const") ||
      line.startsWith("var")
    ) {
      let tokens = tokenize(line);
      let varName = tokens[1];
      if (declaredVars.has(varName)) {
        // we reached the end of a snippet if we see a redeclaration of a previously declared variable
        snippets.add(
          removeTrailingComments(
            lines.slice(startOfCurrentSnippet, i - 1).join("\n")
          )
        );
        startOfCurrentSnippet = i;
        declaredVars.clear();
      }
      declaredVars.add(varName);
    }
  }
  if (startOfCurrentSnippet < lines.length) {
    snippets.add(lines.slice(startOfCurrentSnippet, lines.length).join("\n"));
  }
  return snippets;
}

function findAllRequires(codeBlock: string): string {
  let requires: string[] = [];
  let lines = codeBlock.split("\n");
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (line.indexOf("require") !== -1) {
      requires.push(line);
    }
  }
  return requires.join("\n");
}

function hasNoRequires(snippet: string): boolean {
  return findAllRequires(snippet) === "";
}

export function getPackageMethods(
  pkgName: string,
  methodsFile?: string
): string[] {
  var api: API;
  if (methodsFile != undefined) {
    //use json file if provided, otherwise, re-explore API
    api = JSON.parse(fs.readFileSync(methodsFile, "utf8"));
  } else {
    api = exploreAPI(pkgName);
  }

  return Array.from(api.getFunctions(pkgName)).map((f) => f.functionName);
}

if (require.main === module) {
  (async () => {
    const parser = yargs(hideBin(process.argv))
      .usage(
        "Usage: $0 --package <package path> --mode <mode> [--method <method name> --methodsFile <methods json file>]"
      )
      .options({
        package: {
          type: "string",
          description: "path of package to analyze",
          demandOption: true,
        },
        mode: {
          type: "string",
          description:
            "specify singlemethod to analyze only one specified method in the package or batchmode to analyze all methods in the package. If batchmode is specified, and no methods json file is provided, exploreAPIs will be called to extract method info.",
          choices: ["singlemethod", "batchmode"],
          default: "singlemethod",
        },
        method: {
          type: "string",
          description: "method name to analyze, if singlemethod mode is used",
          demandOption: false,
        },
        methodsFile: {
          type: "string",
          description:
            "path to json file containing all the package methods, as extracted by exploreAPIs",
          demandOption: false,
        },
        outputFile: {
          type: "string",
          description: "optional output file for results",
          demandOption: false,
        },
      });

    const argv = await parser.argv;
    const pkgDir = argv.package;
    const methName = argv.method;
    const methodsFile = argv.methodsFile;
    const mode = argv.mode;
    let methods: Array<string>;

    if (mode == "batchmode") {
      methods = getPackageMethods(pkgDir, methodsFile);
    } else {
      //mode is singlemethod
      methods = [];
      if (methName != undefined) methods.push(methName);
      else
        throw new Error(
          "singlemethod mode specified, but no method name provided"
        );
    }

    const result = getDocSnippetsAsJson(pkgDir, 3, methods, 10);

    if (argv.outputFile) {
      fs.writeFileSync(argv.outputFile, result);
    } else {
      console.log(result);
    }
  })();
}
