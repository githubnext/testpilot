// a minimal type definition file covering only what we need
declare module "espree" {
  export interface Options {
    ecmaVersion?: number | "latest";
    loc?: boolean;
    comment?: boolean;
  }
  export function parse(code: string, options?: Options): any;
}
