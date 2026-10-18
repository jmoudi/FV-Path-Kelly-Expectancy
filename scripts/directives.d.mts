// Types for directives.mjs, which vite.config.ts imports (the project carries no Node typings).
import type { Plugin } from "vite";

export declare const SOURCE: string;
export declare const TARGET: string;
export declare function copyDirectives(root: string, publicDir?: string): boolean;
export declare function directivesPlugin(): Plugin;
