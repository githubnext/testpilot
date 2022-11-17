import { expect } from "chai";
import dedent from "dedent";
import deepEqualInAnyOrder from "deep-equal-in-any-order";
import * as docSnippetMiner from "../src/docSnippets";

const chai = require("chai");
chai.use(deepEqualInAnyOrder);

describe("unit test findFencedCodeBlocks", () => {
  it("should not detect snippets in non-covered language fencing", () => {
    const extractedSnippets = docSnippetMiner.findFencedCodeBlocks(
      `${__dirname}/input/coffee-fencing.md`
    );
    expect(extractedSnippets.size).equal(0);
  });

  it("should detect snippets in general fencing", () => {
    const expectedSnippets = [
      "```\n" +
        "const vol = Volume.fromJSON({\n" +
        "  '/app/index.js': '...',\n" +
        "  '/app/package.json': '...',\n" +
        "});\n" +
        "```",
    ];
    const extractedSnippets = docSnippetMiner.findFencedCodeBlocks(
      `${__dirname}/input/non-lang-fencing.md`
    );
    expect(new Set(expectedSnippets)).to.deep.equal(extractedSnippets);
  });

  it("should detect snippet in js fencing", () => {
    const expectedSnippets = [
      dedent`
        \`\`\`js
        const vol = Volume.fromJSON({
          "/app/index.js": "...",
          "/app/package.json": "...",
        });
        \`\`\`
      `,
    ];
    const extractedSnippets = docSnippetMiner.findFencedCodeBlocks(
      `${__dirname}/input/js-fencing-1.md`
    );
    expect(new Set(expectedSnippets)).to.deep.equal(extractedSnippets);
  });

  it("should detect snippet in ts fencing", () => {
    const expectedSnippets = [
      dedent`
        \`\`\`ts
        const vol = Volume.fromJSON({
          "/app/index.js": "...",
          "/app/package.json": "...",
        });
        \`\`\`
      `,
    ];
    const extractedSnippets = docSnippetMiner.findFencedCodeBlocks(
      `${__dirname}/input/ts-fencing-1.md`
    );
    expect(new Set(expectedSnippets)).to.deep.equal(extractedSnippets);
  });

  it.skip("should detect snippet with formatted fencing", () => {
    const expectedSnippets = [
      "```js\nconcat = require('pull-stream/sinks/concat')\n```",
      "```js\nconcat(cb)\n```",
    ];
    const extractedSnippets = docSnippetMiner.findFencedCodeBlocks(
      `${__dirname}/input/pull-stream-concat.md`
    );
    expect(new Set(expectedSnippets)).to.deep.equal(extractedSnippets);
  });
});

describe("unit tests for callsAPIMethod", () => {
  it("should find method call in js fencing", () => {
    const inputSnippet =
      "```js\n" +
      "const vol = Volume.fromJSON({\n" +
      "  '/app/index.js': '...',\n" +
      "  '/app/package.json': '...',\n" +
      "});\n" +
      "```";

    expect(docSnippetMiner.callsAPIMethod(inputSnippet, "fromJSON")).to.be.true;
    expect(docSnippetMiner.callsAPIMethod(inputSnippet, "Volume")).to.be.false;
    expect(docSnippetMiner.callsAPIMethod(inputSnippet, "app")).to.be.false;
  });

  it("should not partially match method names", () => {
    const inputSnippet =
      "```js\n" +
      "vol.writeFileSync('/script.sh', 'sudo rm -rf *')\n" +
      'vol.toJSON(); // {"/script.sh": "sudo rm -rf *"}\n' +
      "fromTest();\n" +
      "toFile = 5;\n";
    ("```");

    expect(docSnippetMiner.callsAPIMethod(inputSnippet, "toJSON")).to.be.true;
    expect(docSnippetMiner.callsAPIMethod(inputSnippet, "JSON")).to.be.false;

    expect(docSnippetMiner.callsAPIMethod(inputSnippet, "fromTest")).to.be.true;
    expect(docSnippetMiner.callsAPIMethod(inputSnippet, "from")).to.be.false;
    expect(docSnippetMiner.callsAPIMethod(inputSnippet, "Test")).to.be.false;

    expect(docSnippetMiner.callsAPIMethod(inputSnippet, "toFile")).to.be.false;
  });
});

describe("test snippet trimming to max length", () => {
  it("should not trim", () => {
    const inputSnippet = dedent`
      import { fs } from 'memfs';

      fs.writeFileSync('/hello.txt', 'World!');
      fs.readFileSync('/hello.txt', 'utf8'); // World!
    `;

    expect(docSnippetMiner.trimSnippetToMaxLength(inputSnippet, 4)).to.equal(
      inputSnippet
    );
    expect(docSnippetMiner.trimSnippetToMaxLength(inputSnippet, 6)).to.equal(
      inputSnippet
    );
  });

  it("it should trim to maxLength", () => {
    const inputSnippet = dedent`
        import { fs, vol } from 'memfs';
        
        const json = {
          './README.md': '1',
          './src/index.js': '2',
          './node_modules/debug/index.js': '3',
        };
        vol.fromJSON(json, '/app');
        
        fs.readFileSync('/app/README.md', 'utf8'); // 1
        vol.readFileSync('/app/src/index.js', 'utf8'); // 2
    `;

    const expectedSnippet = dedent`
      import { fs, vol } from 'memfs';
      
      const json = {
        './README.md': '1',
        './src/index.js': '2',
        './node_modules/debug/index.js': '3',
    `;

    expect(docSnippetMiner.trimSnippetToMaxLength(inputSnippet, 6)).to.equal(
      expectedSnippet
    );
  });
});
