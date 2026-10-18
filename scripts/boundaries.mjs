#!/usr/bin/env node
/**
 * The import boundaries of ARCHITECTURE.md, checked by reading import lines (no
 * ESLint, no TypeScript). `npm run boundaries`; exits 1 and lists every breach.
 *
 *   1. kit never imports app.
 *   2. model imports only model and kit/math (no data, scenarios, view, wiring, React).
 *   3. data imports only model, data and the kit (no scenarios, view, wiring).
 *   4. scenarios import model, data, scenarios and the kit (never view or the wiring).
 *   5. view imports no value from model (types only): the maths runs in scenarios.
 *   6. model, data, scenarios, kit/events/bus.ts and the worker entry are worker-safe:
 *      what they import, followed through every value import, reaches no npm package
 *      (React, zustand, the chart libraries), no .tsx file and no stylesheet.
 *
 * Type-only imports (`import type`, or every specifier marked `type`) are erased by
 * the compiler and are allowed across rules 5 and 6.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const rel = (f) => path.relative(ROOT, f).split(path.sep).join("/");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

/** Every import of a file: { spec, typeOnly }. Comments are stripped first. */
function importsOf(file) {
  const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const out = [];
  const re = /(?:^|[\n;])\s*(import|export)\s+(type\s+)?([\s\S]*?)\s*from\s*["']([^"']+)["']|(?:^|[\n;])\s*import\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
  for (const m of src.matchAll(re)) {
    if (m[5]) out.push({ spec: m[5], typeOnly: false });
    else if (m[6]) out.push({ spec: m[6], typeOnly: false });
    else {
      const clause = m[3] ?? "";
      const braces = /^\{([\s\S]*)\}$/.exec(clause.trim());
      const allTyped = !!braces && braces[1].split(",").map((s) => s.trim()).filter(Boolean).every((s) => s.startsWith("type "));
      out.push({ spec: m[4], typeOnly: !!m[2] || allTyped });
    }
  }
  return out;
}

/** A specifier to a file under src, or { pkg } for an npm package, or { asset } for CSS and the like. */
function resolve(spec, from) {
  let base;
  if (spec.startsWith("@kit/")) base = path.join(SRC, "kit", spec.slice(5));
  else if (spec.startsWith("@app/")) base = path.join(SRC, "app", spec.slice(5));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return { pkg: spec };
  if (/\.(css|svg|png|json)$/.test(base)) return { asset: base };
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (existsSync(cand) && statSync(cand).isFile()) return { file: cand };
  }
  return { missing: base };
}

const files = walk(SRC);
const layerOf = (f) => {
  const r = rel(f);
  if (r.startsWith("src/kit/")) return "kit";
  const m = /^src\/app\/(model|data|scenarios|view)\//.exec(r);
  if (m) return m[1];
  if (r.startsWith("src/app/")) return "wiring";
  return "main";
};

const breaches = [];
const breach = (file, spec, why) => breaches.push(`${rel(file)}: "${spec}" — ${why}`);

for (const file of files) {
  const layer = layerOf(file);
  for (const { spec, typeOnly } of importsOf(file)) {
    const r = resolve(spec, file);
    if (r.missing) {
      breach(file, spec, "does not resolve");
      continue;
    }
    const target = r.file ? layerOf(r.file) : r.pkg ? "pkg" : "asset";
    if (layer === "kit" && r.file && rel(r.file).startsWith("src/app/")) breach(file, spec, "kit never imports app (rule 1)");
    if (layer === "model" && r.file) {
      const ok = target === "model" || rel(r.file).startsWith("src/kit/math/");
      if (!ok) breach(file, spec, "model imports only model and kit/math (rule 2)");
    }
    if (layer === "model" && r.pkg) breach(file, spec, "model imports no package (rule 2)");
    if (layer === "data" && r.file && !["model", "data", "kit"].includes(target)) breach(file, spec, "data imports only model, data and the kit (rule 3)");
    if (layer === "scenarios" && r.file && !["model", "data", "scenarios", "kit"].includes(target)) breach(file, spec, "scenarios never import view or the wiring (rule 4)");
    if (layer === "view" && r.file && target === "model" && !typeOnly) breach(file, spec, "view imports types only from model; the maths runs in scenarios (rule 5)");
  }
}

// Rule 6: the worker-safe closure.
const reachCache = new Map();
/** The first thing on the value-import closure of `file` that is not worker-safe, as a chain, or null. */
function unsafeChain(file, seen = new Set()) {
  if (reachCache.has(file)) return reachCache.get(file);
  if (seen.has(file)) return null;
  seen.add(file);
  let found = null;
  if (file.endsWith(".tsx")) found = [rel(file)];
  else {
    for (const { spec, typeOnly } of importsOf(file)) {
      if (typeOnly) continue;
      const r = resolve(spec, file);
      if (r.pkg) found = [rel(file), `package ${r.pkg}`];
      else if (r.asset) found = [rel(file), `asset ${path.basename(r.asset)}`];
      else if (r.file) {
        const sub = unsafeChain(r.file, seen);
        if (sub) found = [rel(file), ...sub];
      }
      if (found) break;
    }
  }
  reachCache.set(file, found);
  return found;
}

const workerSafe = files.filter((f) => ["model", "data", "scenarios"].includes(layerOf(f)) || ["src/kit/events/bus.ts", "src/app/worker.ts"].includes(rel(f)));
for (const f of workerSafe) {
  const chain = unsafeChain(f);
  if (chain) breaches.push(`${rel(f)}: not worker-safe (rule 6): ${chain.join(" → ")}`);
}

if (breaches.length) {
  console.error(`Boundaries broken (${breaches.length}):`);
  for (const b of breaches) console.error(`  ${b}`);
  process.exit(1);
}
console.log(`Boundaries hold: ${files.length} files; kit → app none; model, data, scenarios and the worker entry worker-safe.`);
