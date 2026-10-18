// One source for the directives document. docs/DIRECTIVES.md is copied to
// public/directives.md, which Vite serves in dev and copies into dist/ on build; the
// Guide fetches it at run time and never imports it, so its text stays out of the bundle.
//
// The Vite plugin (vite.config.ts) copies whenever Vite starts (npm run build, npm run dev,
// npx vite build, vite preview's config load, vitest) and again whenever the source
// changes while the dev server runs. On its own: node scripts/directives.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SOURCE = "docs/DIRECTIVES.md";
export const TARGET = "directives.md";

/** Copies the source into the public directory; false when there is no source. */
export function copyDirectives(root, publicDir = join(root, "public")) {
  const from = resolve(root, SOURCE);
  if (!existsSync(from)) return false;
  const text = readFileSync(from, "utf8");
  const to = join(publicDir, TARGET);
  if (existsSync(to) && readFileSync(to, "utf8") === text) return true;
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(to, text);
  return true;
}

export function directivesPlugin() {
  let root = process.cwd();
  let publicDir = join(root, "public");
  return {
    name: "directives-md",
    // Copy as soon as the config is known: the dev server lists the public files when it is
    // created, before any build hook runs, and serves only the files on that list.
    configResolved(config) {
      root = config.root;
      if (config.publicDir) publicDir = config.publicDir;
      if (!copyDirectives(root, publicDir)) config.logger.warn(`${SOURCE} not found: the Guide's Directives will say it cannot be loaded`);
    },
    buildStart() {
      copyDirectives(root, publicDir);
    },
    configureServer(server) {
      const from = resolve(root, SOURCE);
      server.watcher.add(from);
      server.watcher.on("change", (file) => {
        if (resolve(file) === from) copyDirectives(root, publicDir);
      });
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  console.log(copyDirectives(root) ? `copied ${SOURCE} to public/${TARGET}` : `${SOURCE} not found`);
}
