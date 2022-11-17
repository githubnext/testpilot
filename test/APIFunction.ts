import { expect } from "chai";
import { APIFunction } from "../src/exploreAPI";

describe("test APIFunction", () => {
  it("should be possible to construct an API function from a short access path directly", () => {
    const apiFunction = new APIFunction(
      "zip-a-folder",
      {
        type: "function",
        signature: "(srcFolder, zipFilePath)",
        isAsync: false,
        isConstructor: true,
        implementation: "",
      },
      "zip-a-folder"
    );
    expect(apiFunction.packageName).to.equal("zip-a-folder");
    expect(apiFunction.accessPath).to.equal("zip-a-folder");
    expect(apiFunction.functionName).to.equal("zip-a-folder");

    const sig = "class zip-a-folder(srcFolder, zipFilePath)";
    expect(apiFunction).to.deep.equal(APIFunction.fromSignature(sig));
    expect(apiFunction.signature).to.equal(sig);
  });

  it("should be possible to construct an API function from a typical access path directly", () => {
    const apiFunction = new APIFunction(
      "plural.addRule",
      {
        type: "function",
        signature: "(match, result)",
        isAsync: false,
        isConstructor: false,
        implementation: "",
      },
      "plural"
    );
    expect(apiFunction.packageName).to.equal("plural");
    expect(apiFunction.accessPath).to.equal("plural.addRule");
    expect(apiFunction.functionName).to.equal("addRule");

    const sig = "plural.addRule(match, result)";
    expect(apiFunction).to.deep.equal(APIFunction.fromSignature(sig));
    expect(apiFunction.signature).to.equal(sig);
  });

  it("should be possible to construct an APIFunction from a longer access path directly", () => {
    const apiFunction = new APIFunction(
      "zip-a-folder.ZipAFolder.tar",
      {
        type: "function",
        signature: "(srcFolder, tarFilePath, zipAFolderOptions)",
        isAsync: true,
        isConstructor: false,
        implementation: "",
      },
      "zip-a-folder"
    );
    expect(apiFunction.packageName).to.equal("zip-a-folder");
    expect(apiFunction.accessPath).to.equal("zip-a-folder.ZipAFolder.tar");
    expect(apiFunction.functionName).to.equal("tar");

    const sig =
      "zip-a-folder.ZipAFolder.tar(srcFolder, tarFilePath, zipAFolderOptions) async";
    expect(apiFunction).to.deep.equal(APIFunction.fromSignature(sig));
    expect(apiFunction.signature).to.equal(sig);
  });

  it("should handle invalid signatures correctly", () => {
    expect(() => APIFunction.fromSignature("")).to.throw();
    expect(() => APIFunction.fromSignature("zip-a-folder")).to.throw();
    expect(() =>
      APIFunction.fromSignature("zip-a-folder(srcFolder, zipFilePath) asnyc")
    ).to.throw();
  });

  it("should handle package names containing a dot correctly", () => {
    const apiFunction = new APIFunction(
      "zip.a-folder.ZipAFolder.tar",
      {
        type: "function",
        signature: "(srcFolder, tarFilePath, zipAFolderOptions)",
        isAsync: true,
        isConstructor: false,
        implementation: "",
      },
      "zip.a-folder"
    );
    expect(apiFunction.packageName).to.equal("zip.a-folder");
    expect(apiFunction.accessPath).to.equal("zip.a-folder.ZipAFolder.tar");
    expect(apiFunction.functionName).to.equal("tar");

    const sig =
      "zip.a-folder.ZipAFolder.tar(srcFolder, tarFilePath, zipAFolderOptions) async";
    expect(apiFunction.signature).to.equal(sig);
  });

  it("should be possible to serialize and deserialize API functions", () => {
    const apiFunction = APIFunction.fromSignature(
      "zip-a-folder(srcFolder, zipFilePath)"
    );
    const serialized = JSON.stringify(apiFunction);
    const deserialized = APIFunction.fromJSON(JSON.parse(serialized));
    expect(deserialized).to.deep.equal(apiFunction);
  });
});
