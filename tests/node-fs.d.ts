// The one Node API the tests read the stylesheets with (the project carries no Node typings).
declare module "node:fs" {
  export function readFileSync(path: string | URL, encoding: "utf8"): string;
}
