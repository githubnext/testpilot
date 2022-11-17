import fs from "fs";
import path from "path";
import { addHook } from "pirates";
import * as espree from "espree";
import * as estraverse from "estraverse";
import { performance } from "perf_hooks";

function extend(accessPath: string, component: string) {
  if (component === "default" && !accessPath.includes(".")) {
    return accessPath;
  } else if (component.match(/^[a-zA-Z_$][\w$]*$/)) {
    return accessPath + "." + component;
  } else if (component.match(/^\d+$/)) {
    return accessPath + "[" + component + "]";
  } else {
    return accessPath + "['" + component.replace(/['\\]/, "\\$&") + "']";
  }
}

export type FunctionDescriptor = {
  type: "function";
  signature: string;
  isAsync: boolean;
  implementation: string;
  isConstructor: boolean;
  docComment?: string;
};
export type ApiElementDescriptor =
  | {
      type:
        | "bigint"
        | "boolean"
        | "number"
        | "string"
        | "symbol"
        | "object"
        | "array"
        | "undefined"
        | "null";
    }
  | FunctionDescriptor;

export class API {
  constructor(
    private readonly elements = new Map<string, ApiElementDescriptor>()
  ) {}

  set(accessPath: string, value: ApiElementDescriptor) {
    this.elements.set(accessPath, value);
  }

  get(accessPath: string) {
    return this.elements.get(accessPath);
  }

  *getFunctions(packageName: string) {
    for (const [accessPath, descriptor] of this.elements) {
      if (descriptor.type === "function") {
        yield new APIFunction(accessPath, descriptor, packageName);
      }
    }
  }

  toJSON() {
    return [...this.elements];
  }

  static fromJSON(json: [string, ApiElementDescriptor][]) {
    return new API(new Map(json));
  }
}

/**
 * A representation of an API function, including both its access path and a
 * function descriptor.
 */
export class APIFunction {
  constructor(
    public readonly accessPath: string,
    public readonly descriptor: FunctionDescriptor,
    public readonly packageName: string
  ) {}

  /**
   * Parse a given signature into an API function.
   *
   * The signature is expected to consist of an optional initial `class `, then
   * a dot-separated access path (starting with the package name, ending with
   * the function name), followed by a parenthesised list of parameters,
   * optionally followed by ` async`.
   *
   * Example:
   *
   * ```
   * zip-a-folder.ZipAFolder.tar(srcFolder, tarFilePath, zipAFolderOptions) async
   * ```
   */
  public static fromSignature(
    signature: string,
    implementation: string = ""
  ): APIFunction {
    const match = signature.match(
      /^(class )?([-\w$]+(?:\.[\w$]+)*)(\(.*\))( async)?$/
    );
    if (!match) throw new Error(`Invalid signature: ${signature}`);
    const [, isConstructor, accessPath, parameters, isAsync] = match;
    const descriptor: FunctionDescriptor = {
      type: "function",
      signature: parameters,
      isAsync: !!isAsync,
      isConstructor: !!isConstructor,
      implementation,
    };
    return new APIFunction(accessPath, descriptor, accessPath.split(".")[0]); // infer package name from accesspath. This will not work for package names that contain a "."
  }

  /** Serialize the API function to a JSON object. */
  public toJSON(): object {
    return {
      accessPath: this.accessPath,
      descriptor: this.descriptor,
      packageName: this.packageName,
    };
  }

  /** Deserialize an API function from a JSON object. */
  public static fromJSON(json: object): APIFunction {
    const { accessPath, descriptor, packageName } = json as any;
    return new APIFunction(accessPath, descriptor, packageName);
  }

  /** The name of the function itself. */
  public get functionName(): string {
    return this.accessPath.split(".").pop()!;
  }

  /** The full signature of the function. */
  public get signature(): string {
    const { signature, isAsync, isConstructor } = this.descriptor;
    return (
      (isConstructor ? "class " : "") +
      this.accessPath +
      signature +
      (isAsync ? " async" : "")
    );
  }
}

const funcToString = Function.prototype.toString;

/**
 * Determine if a function is a constructor
 */
function isConstructor(fn: Function) {
  return funcToString.call(fn).startsWith("class ");
}

function getSignature(fn: Function) {
  let funcStr = funcToString.call(fn);

  if (isConstructor(fn)) {
    // if funcStr does not contain the word 'constructor', then there it is a default constructor with no arguments
    if (!funcStr.match(/constructor\s*\(/)) {
      return "()";
    } else {
      // otherwise, find the signature of the constructor
      let match = funcStr.match(/constructor\s*\(([^)]*)\)/);
      if (match) {
        return "(" + match[1] + ")";
      } else {
        throw new Error(`Could not find constructor signature in ${funcStr}`);
      }
    }
  }

  let openingParen = funcStr.indexOf("("),
    closingParen = funcStr.indexOf(")");
  if (openingParen === -1 || closingParen === -1) {
    return "()";
  }
  let funcSig = funcStr.slice(openingParen + 1, closingParen);
  let nrArgs = funcSig.split(",").length;
  if (fn.length <= nrArgs) {
    return `(${funcSig})`;
  } else {
    let pseudoArgs = [];
    for (let i = 1; i <= fn.length; i++) {
      pseudoArgs.push(`arg${i}`);
    }
    return `(${pseudoArgs.join(", ")})`;
  }
}

/**
 * Normalizes a function implementation to unify whitespace. This allows matching functions identified through parsing the
 * source code to those identified dynamically from the object graph.
 * @param source implementation source code to normalize
 * @returns normalized source code
 */
export function normalizeFunctionSource(source: string) {
  return source.replace(/\s+/g, " ").replace(/(?<!\w)\s+|\s+(?!\w)/g, "");
}

function describe(
  value: any,
  docComments: Map<string, string>
): ApiElementDescriptor {
  const type = typeof value;
  switch (type) {
    case "bigint":
    case "boolean":
    case "number":
    case "string":
    case "symbol":
    case "undefined":
      return { type };
    case "object":
      if (value === null) {
        return { type: "null" };
      } else if (Array.isArray(value)) {
        return { type: "array" };
      }
      return { type: "object" };
    case "function":
      const isConstr = isConstructor(value);
      const signature = getSignature(value);
      const implementation = funcToString.call(value);
      const isAsync = implementation.startsWith("async ");
      const docComment = docComments.get(
        normalizeFunctionSource(implementation)
      );
      return {
        type: "function",
        signature,
        implementation,
        isAsync,
        isConstructor: isConstr,
        docComment,
      };
  }
}

function getProperties(obj: object) {
  let props = new Set<string>();
  // add enumerable properties
  for (let prop in obj) {
    props.add(prop);
  }
  // also add non-enumerable properties (such as static methods)
  const propDescs = Object.getOwnPropertyDescriptors(obj);
  for (let prop in propDescs) {
    const propDesc = propDescs[prop];
    if ("value" in propDesc) props.add(prop);
  }
  return props;
}

/**
 * Determines the set of (`path`, `type`) pairs that constitute an API.
 *
 * @param pkgName the name of the package to explore
 * @param pkgExports the object returned by `require(pkgName)`
 */
function exploreExports(
  pkgName: string,
  pkgExports: any,
  docComments: Map<string, string>
): API {
  const api = new API();
  const seen = new Set<any>();

  function explore(accessPath: string, value: any) {
    if (seen.has(value)) {
      return;
    } else {
      seen.add(value);
    }

    const descriptor = describe(value, docComments);
    if (descriptor.type !== "object" && descriptor.type !== "null") {
      api.set(accessPath, descriptor);
    }

    exploreProperties(accessPath, descriptor, value);
  }

  function exploreProperties(
    accessPath: string,
    descriptor: ApiElementDescriptor,
    value: any
  ) {
    if (["array", "function", "object"].includes(descriptor.type)) {
      for (const prop of getProperties(value)) {
        // skip private properties as well as special properties of classes, functions, and arrays
        if (
          prop.startsWith("_") ||
          ["super", "super_", "constructor"].includes(prop) ||
          (descriptor.type === "function" &&
            ["arguments", "caller", "length", "name"].includes(prop)) ||
          (descriptor.type === "array" && prop === "length")
        ) {
          continue;
        }

        explore(extend(accessPath, prop), value[prop]);
      }
    }
  }

  explore(pkgName, pkgExports);
  return api;
}

/**
 * Sanitize package name by replacing non-alphanumeric characters with underscores.
 * @param pkgName the package name to sanitize
 */
export function sanitizePackageName(pkgName: string) {
  return pkgName.replace(/[^a-zA-Z0-9_$]/g, "_");
}

/**
 * Populates the `docComments` map with the doc comments found in the given code.
 * @param code the code to search for functions and their corresponding docComments in
 * @param docComments the map to populate with doc comments, where the map key is the normalized function source code
 * @returns the passed code as is
 */
export function findDocComments(
  code: string,
  docComments: Map<string, string>
): string {
  performance.mark("doc-comment-extraction-start");
  try {
    const ast = espree.parse(code, {
      ecmaVersion: "latest",
      loc: true,
      comment: true,
    });

    const comments = ast.comments.filter(
      (comment: any) => comment.type === "Block"
    );

    estraverse.traverse(ast, {
      enter(node) {
        if (
          node.type === "FunctionDeclaration" ||
          node.type === "FunctionExpression"
        ) {
          const { start, end } = node as any;
          const functionSource = normalizeFunctionSource(
            code.slice(start, end)
          );

          //doc comment ends on immediately preceding line
          const fnDocComment = comments.find(
            (comment: any) => comment.loc.end.line == node.loc!.start.line - 1
          );
          if (fnDocComment) docComments.set(functionSource, fnDocComment.value);
        }
      },
    });
  } catch (e: any) {
    console.warn(`Error parsing code with espree: ${e}`); //failed parsing throws a SyntaxError exception
  }
  performance.measure("doc-comment-extraction", "doc-comment-extraction-start");

  return code;
}

export function exploreAPI(pkgPath: string): API {
  performance.mark("api-exploration-start");
  const pkgName = JSON.parse(
    fs.readFileSync(path.join(pkgPath, "package.json"), "utf8")
  ).name;
  const docComments: Map<string, string> = new Map();
  const revert = addHook((code, filename) =>
    findDocComments(code, docComments)
  );
  const pkgExports = require(pkgPath);
  revert();
  const api = exploreExports(pkgName, pkgExports, docComments);
  performance.measure("api-exploration", "api-exploration-start");
  return api;
}

if (require.main === module) {
  // Usage: node exploreAPI.js <pkgPath>
  console.log(JSON.stringify(exploreAPI(process.argv[2]), null, 2));
}
