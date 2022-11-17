import path from "path";
import { ICompletionModel } from "./completionModel";
import { readFileSync } from "fs";

export class MockCompletionModel implements ICompletionModel {
  private completionMap: Map<string, string[]> = new Map();

  constructor(private strictResponses: boolean) {}

  static fromFile(file: string, strictResponses: boolean) {
    const data = JSON.parse(readFileSync(file, "utf8"));
    console.log("Loading completions from file");
    const model = new MockCompletionModel(strictResponses);
    for (const { file: promptFile, temperature, completions } of data.prompts) {
      const prompt = readFileSync(
        path.join(path.dirname(file), "prompts", promptFile),
        "utf8"
      );
      model.addCompletions(prompt, temperature, completions);
    }
    return model;
  }

  private key(prompt: string, temperature: number) {
    return JSON.stringify([prompt, temperature]);
  }

  public addCompletions(
    prompt: string,
    temperature: number,
    completions: string[]
  ) {
    this.completionMap.set(this.key(prompt, temperature), completions);
  }

  public async completions(
    prompt: string,
    temperature: number
  ): Promise<Set<string>> {
    const completions = this.completionMap.get(this.key(prompt, temperature));
    if (!completions) {
      const err = `Prompt not found at temperature ${temperature}: ${prompt}`;
      if (this.strictResponses) {
        throw new Error(err);
      } else {
        console.warn(err);
      }
    }
    return new Set(completions);
  }
}
