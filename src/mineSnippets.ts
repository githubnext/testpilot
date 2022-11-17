import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import AdmZip from "adm-zip";
import { Snippets } from "./snippetHelper";

const snippetHelper = new Snippets();

/**
 * Extract raw information about usage snippets for the given methods from the
 * given CodeQL database.
 *
 * @param database The path to the CodeQL database.
 * @param methods The methods to extract usage snippets for.
 * @returns A stream of result tuples `{id, method, file, line}`, where `id` is
 *          the CodeQL ID of a call to `method`, and `file`:`line` belongs to
 *          the intraprocedural slice of this call.
 */
export function* getSnippetData(database: string, methods: string[]) {
  // create temporary CSV file to store relevant method names in
  const csvFile = `${os.tmpdir()}/targetMethod.csv`;
  const escapedMethodNames = methods.map(
    (method) => `"${method.replace(/"/g, '""')}"`
  );
  fs.writeFileSync(csvFile, escapedMethodNames.join("\n") + "\n");

  // run mining query
  const bqrsFile = `${os.tmpdir()}/results.bqrs`;
  cp.execFileSync(
    "codeql",
    [
      "query",
      "run",
      "-d",
      database,
      "-o",
      bqrsFile,
      "--external",
      `targetFunction=${csvFile}`,
      path.join(__dirname, "../../ql/queries/SnippetMining.ql"),
    ],
    { stdio: "inherit" }
  );

  // decode results into CSV format
  const outputFile = `${os.tmpdir()}/results.csv`;
  cp.execFileSync(
    "codeql",
    [
      "bqrs",
      "decode",
      "--format",
      "csv",
      "--no-titles",
      "--entities",
      "id",
      "--output",
      outputFile,
      bqrsFile,
    ],
    { stdio: "inherit" }
  );

  const results = fs.readFileSync(outputFile, "utf8");
  for (const data of results.split("\n")) {
    let [id, method, file, line] = data.split(",");
    if (!id) {
      continue;
    }
    yield {
      id: +id,
      method: method.slice(1, -1),
      file: file.slice(1, -1),
      line: +line,
    };
  }
}

type SnippetMap = [string, Map<string, number[]>][];

/**
 * Extract structured information about usage snippets for the given methods
 * from the given CodeQL database
 *
 * @param database The path to the CodeQL database.
 * @param methods The methods to extract usage snippets for.
 * @returns A sparse array indexed by CodeQL IDs. For each ID it records the
 *          name of the called method as well as a map from file names to
 *          relevant line numbers in that file.
 */
export function getSnippetsInfo(
  database: string,
  methods: string[]
): SnippetMap {
  const snippets: SnippetMap = [];

  for (const { id, method, file, line } of getSnippetData(database, methods)) {
    if (!snippets[id]) {
      snippets[id] = [method, new Map()];
    }
    const fileMap = snippets[id][1];
    if (!fileMap.has(file)) {
      fileMap.set(file, []);
    }
    const lineNumbers = fileMap.get(file)!;
    lineNumbers.push(line);
  }

  return snippets;
}

/**
 * Extract usage snippets for the given methods from the given CodeQL database.
 *
 * @param database The path to the CodeQL database.
 * @param numSnippets The number of snippets to extract.
 * @param methods The methods to extract usage snippets for.
 * @param maxLength The maximum number of lines to include in each snippet.
 * @returns A string array of usage snippets.
 */

export function getSnippets(
  database: string,
  numSnippets: number,
  methods: string[],
  maxLength: number
): Map<string, string[]> {
  let results = new Map<string, Set<string>>();

  // mine snippets
  const snippets = getSnippetsInfo(database, methods);

  // now output them
  const srcArchive = new AdmZip(path.join(database, "src.zip"));
  for (const i in snippets) {
    const [methodName, files] = snippets[i];
    let currentSnippet = `for ${methodName}`;
    for (const [file, lineNumbers] of files.entries()) {
      const contents = srcArchive.readAsText(file.slice(1));
      const lines = contents.split("\n");

      // pull out relevant lines from the file and record
      // minimum indentation level
      let relevantLineNumbers = lineNumbers.sort((a, b) => a - b);
      if (maxLength !== -1) {
        relevantLineNumbers = relevantLineNumbers.slice(-maxLength);
      }
      const relevantLines = [];
      let minIndent = -1;
      for (const lineNumber of relevantLineNumbers) {
        const line = lines[lineNumber - 1] || "";
        const indent = line.search(/\S/);
        if (minIndent === -1 || indent < minIndent) {
          minIndent = indent;
        }
        relevantLines.push(line);
      }
      if (minIndent === -1) {
        minIndent = 0;
      }

      // output relevant lines, outdenting them by the minimum indentation
      for (const line of relevantLines) {
        currentSnippet += `\n ${line}`;
      }
    }
    if (results.has(methodName)) {
      results.get(methodName)!.add(currentSnippet);
    } else {
      results.set(methodName, new Set([currentSnippet]));
    }
  }

  // select snippets that are dissimilar
  let finalSnippets = new Map<string, string[]>();
  for (let [method, snippets] of results) {
    // if we have too many snippets, throw some away (snippet selection doesn't scale beyond ~50 snippets)
    if (snippets.size > snippetHelper.MAX_SNIPPETS) {
      snippets = new Set([...snippets].slice(0, snippetHelper.MAX_SNIPPETS));
    }
    let selectedSnippets = snippetHelper.selectSnippets(snippets, numSnippets);
    finalSnippets.set(method, Array.from(selectedSnippets));
    snippetHelper.distanceCache.clear();
  }
  return finalSnippets;
}

if (require.main === module) {
  (async () => {
    const parser = yargs(hideBin(process.argv))
      .usage("$0 [-n <num>] [-l <max-length>] <database> <method>")
      .example(
        "$0 ~/databases/memfs toJSON",
        "extract three usage snippets for method toJSON from the memfs database"
      )
      .option("n", {
        describe: "number of snippets to generate",
        default: 3,
        type: "number",
      })
      .option("l", {
        alias: "length",
        describe: "maximum length of each snippet in lines; -1 means no limit",
        default: -1,
        type: "number",
      })
      .demand(2);
    const argv = await parser.argv;
    const database = argv._[0] as string;
    const methods = argv._.slice(1) as string[];
    const numSnippets = argv.n;
    const maxLength = argv.l;
    const allSnippets = getSnippets(database, numSnippets, methods, maxLength);
    for (const [method, snippets] of allSnippets) {
      console.log(`${method}:`);
      console.log(snippets.join("\n"));
    }
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
