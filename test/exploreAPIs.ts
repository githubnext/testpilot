import { expect } from "chai";
import * as exploreAPI from "../src/exploreAPI";
import dedent from "dedent";
import * as espree from "espree";
import { connect } from "http2";

describe("test source code normalization", () => {
  it("should normalize regular functions", () => {
    const code = dedent`
        function   someNumbers () {
            yield 0; 
            yield 1; 
            yield -1;
        }
        `;
    const expected = dedent`
        function someNumbers(){yield 0;yield 1;yield-1;}
        `;
    expect(exploreAPI.normalizeFunctionSource(code)).to.equal(expected);
  });

  it("should normalize generator functions", () => {
    const code = dedent`
        function   *someNumbers () {
            yield 0; 
            yield 1; yield -1;
        }
        `;
    const expected = dedent`
        function*someNumbers(){yield 0;yield 1;yield-1;}
        `;
    expect(exploreAPI.normalizeFunctionSource(code)).to.equal(expected);
  });

  it("should normalize class methods", () => {
    const code = dedent`
         simpleMethod () {const x = 1;}
        `;
    const expected = dedent`
        simpleMethod(){const x=1;}
        `;
    expect(exploreAPI.normalizeFunctionSource(code)).to.equal(expected);
  });

  it("should normalize async class methods", () => {
    const code = dedent`
         async simpleMethod (foo: string) {const x = 1;}
        `;
    const expected = dedent`
        async simpleMethod(foo:string){const x=1;}
        `;
    expect(exploreAPI.normalizeFunctionSource(code)).to.equal(expected);
  });

  it("should normalize async generator class methods", () => {
    const code = dedent`
         async *simpleMethod (foo: string) {const x = 1;}
        `;
    const expected = dedent`
        async*simpleMethod(foo:string){const x=1;}
        `;
    expect(exploreAPI.normalizeFunctionSource(code)).to.equal(expected);
  });
});

describe("test finding doc comments", () => {
  it("should correctly match doc comments", () => {
    const docComment = dedent`
            /**
            * Test Doc Comment
            * @param foo a parameter
            */
        `;

    const function1Def = dedent`
        function simpleMethod(foo) {
            const x = 1;
        }
        `;

    const function2Def = dedent`
        function otherMethod(param) {
            const x = 1;
        }
        `;

    const code = docComment.concat("\n", function1Def, "\n", function2Def);
    const docComments = new Map<string, string>();
    exploreAPI.findDocComments(code, docComments);

    expect(
      docComments.get(exploreAPI.normalizeFunctionSource(function1Def))
    ).to.equal(docComment.slice(2, -2));
    expect(
      docComments.get(exploreAPI.normalizeFunctionSource(function2Def))
    ).to.equal(undefined);
  });

  it("should be robust against failed parsing", () => {
    const docComment = dedent`
            /**
            * Test Doc Comment
            */
        `;

    const functionDef = dedent`
        functoin simpleMethod(param) {
            const x = 1;
        }
        `;

    const code = docComment.concat("\n", functionDef);
    const docComments = new Map<string, string>();
    exploreAPI.findDocComments(code, docComments);
    expect(
      docComments.get(exploreAPI.normalizeFunctionSource(functionDef))
    ).to.equal(undefined);
  });
});
