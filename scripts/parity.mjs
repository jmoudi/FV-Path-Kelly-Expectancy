#!/usr/bin/env node
/**
 * Backend parity: every chart drawn by ECharts, Plotly and Vega-Lite must show the
 * same marks. Builds the app, serves dist/ with its own `vite preview` on a free port
 * in 4300–4399, opens every view (#view/<id>, ids from the view-model) once per
 * backend (the default backend is written into the app's saved state before the
 * page loads), and asks each chart's backend what it drew: bars, points and lines
 * per series, bands, reference lines, labels, and the axis ranges, read from the
 * library's own model or its DOM. ECharts is the reference; it is itself checked
 * against the resolved spec. Any disagreement fails the run.
 *
 *   npm run parity                 build, serve, compare
 *   npm run parity -- --no-build   reuse dist/
 *   npm run parity -- --only=chain-curve,binary-outcomes
 *   npm run parity -- --viewport=400x800   (default 1380x900)
 *
 * Needs Playwright (resolved from the project, $PLAYWRIGHT_PATH, or the global
 * npm root) and a Chromium at $PARITY_CHROME (default: the preinstalled one).
 */
import { execSync, spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const ONLY = new Set((opt("only") ?? "").split(",").filter(Boolean));
const CHROME = process.env.PARITY_CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BACKENDS = ["echarts", "plotly", "vega"];
const STORAGE_KEY = "tranche-replay:v1";
const [vw, vh] = (opt("viewport") ?? "1380x900").split("x").map(Number);
const VIEWPORT = { width: vw || 1380, height: vh || 900 };

const log = (...a) => console.log(...a);

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    /* not a project dependency: look elsewhere */
  }
  const require = createRequire(import.meta.url);
  const dirs = [process.env.PLAYWRIGHT_PATH];
  try {
    dirs.push(path.join(execSync("npm root -g", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(), "playwright"));
  } catch {
    /* no npm on the path */
  }
  for (const dir of dirs.filter(Boolean)) {
    try {
      return require(dir);
    } catch {
      /* try the next */
    }
  }
  throw new Error("Playwright not found: install it, or point PLAYWRIGHT_PATH at its package directory.");
}

function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.listen(port, "127.0.0.1", () => srv.close(() => resolve(true)));
  });
}

async function waitForHttp(url, child, ms = 40000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (child.exitCode != null) return false;
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

/** Start `vite preview` on the first free port in 4300–4399 (from a random start). */
async function startPreview() {
  const start = 4300 + Math.floor(Math.random() * 100);
  for (let i = 0; i < 100; i++) {
    const port = 4300 + ((start - 4300 + i) % 100);
    if (!(await portFree(port))) continue;
    const child = spawn("npx", ["vite", "preview", "--port", String(port), "--strictPort", "--host", "127.0.0.1"], { cwd: ROOT, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const url = `http://127.0.0.1:${port}/`;
    if (await waitForHttp(url, child)) return { url, port, stop: () => killGroup(child) };
    killGroup(child);
    if (!/in use|EADDRINUSE/i.test(out)) throw new Error(`vite preview did not start:\n${out}`);
  }
  throw new Error("No free port in 4300–4399.");
}

function killGroup(child) {
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }
}

/** The view-model, loaded through Vite so the TypeScript sources need no build step. */
async function loadViewModel() {
  const { createServer } = await import("vite");
  const vite = await createServer({ root: ROOT, logLevel: "error", appType: "custom", server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
  try {
    const [{ buildAll }, { DEFAULT_PARAMS, EMPTY_DATASETS }, parity, resolve, points, probe] = await Promise.all([
      vite.ssrLoadModule("/src/viewmodel/index.ts"),
      vite.ssrLoadModule("/src/model/params.ts"),
      vite.ssrLoadModule("/src/kit/charts/parity.ts"),
      vite.ssrLoadModule("/src/charts/resolve.ts"),
      vite.ssrLoadModule("/src/charts/backends/types.ts"),
      vite.ssrLoadModule("/src/kit/charts/probe.ts"),
    ]);
    return { built: buildAll(DEFAULT_PARAMS, EMPTY_DATASETS), parity, resolve, points, probe };
  } finally {
    await vite.close();
  }
}

/** What the spec says should be drawn, for checking the reference backend itself. */
function expected(base, height, width, { resolve, points, probe }) {
  // The host may raise the height (a view page does), and the tick count follows it.
  const spec = height ? { ...base, height } : base;
  const rc = resolve.resolveChart(spec, width);
  const pos = rc.axes.x;
  const inPos = (p) => pos.categorical || probe.inRange(p, pos.min, pos.max);
  const series = [];
  for (const s of spec.series) {
    const mark = s.mark ?? spec.mark;
    if (mark === "bar") series.push({ key: s.field, count: points.barPoints(spec, rc, s).filter((b) => b.value !== 0 && inPos(pos.categorical ? b.pos : b.shifted)).length });
    else series.push({ key: s.field, count: points.linePoints(spec, rc, s).filter(([h, v]) => Number.isFinite(rc.horizontal ? h : v) && inPos(rc.horizontal ? v : h)).length });
  }
  const axis = (ax) => (ax.categorical ? { kind: "category", categories: ax.labels } : { kind: ax.scale, min: ax.min, max: ax.max });
  return { rc, series, h: axis(rc.h), v: axis(rc.v), labels: rc.annotations.filter((a) => a.label && a.text).length };
}

async function stableProbe(page, id) {
  await page.waitForFunction((cid) => !!document.querySelector(`#chart-${cid} .chart-plot`)?.__chartProbe, id, { timeout: 60000 });
  let last = "";
  for (let i = 0; i < 8; i++) {
    const p = await page.evaluate(async (cid) => {
      const el = document.querySelector(`#chart-${cid} .chart-plot`);
      return { probe: await el.__chartProbe(), width: el.clientWidth };
    }, id);
    const s = JSON.stringify(p);
    if (s === last) return p;
    last = s;
    await page.waitForTimeout(300);
  }
  return JSON.parse(last);
}

async function run() {
  if (!flag("no-build")) {
    log("Building…");
    const b = spawnSync("npx", ["vite", "build"], { cwd: ROOT, encoding: "utf8" });
    if (b.status !== 0) {
      console.error(b.stdout, b.stderr);
      throw new Error("vite build failed");
    }
  }
  const vm = await loadViewModel();
  const { built, parity } = vm;
  const all = built.scenarios.flatMap((s) => [...s.primary, ...s.secondary]).filter((c) => c.kind === "xy" || c.kind === "heatmap");
  const views = built.scenarios.flatMap((s) => s.views.map((v) => ({ route: `#view/${v.id}`, name: v.id, charts: v.charts.map((id) => all.find((c) => c.id === id)).filter(Boolean) })));
  const covered = new Set(views.flatMap((v) => v.charts.map((c) => c.id)));
  // Charts no view shows are checked on the tour, in their section.
  for (const s of built.scenarios) {
    const rest = [...s.primary, ...s.secondary].filter((c) => (c.kind === "xy" || c.kind === "heatmap") && !covered.has(c.id));
    if (rest.length) views.push({ route: `#s-${s.id}`, name: `tour/${s.id}`, charts: rest });
  }
  for (const v of views) v.charts = v.charts.filter((c) => !ONLY.size || ONLY.has(c.id));
  const todo = views.filter((v) => v.charts.length);
  const nCharts = new Set(todo.flatMap((v) => v.charts.map((c) => c.id))).size;
  log(`${nCharts} charts in ${todo.length} views × ${BACKENDS.length} backends`);

  const { chromium } = await loadPlaywright();
  const preview = await startPreview();
  log(`Serving dist/ at ${preview.url}`);
  const browser = await chromium.launch({ executablePath: CHROME });
  const results = new Map(); // chart id -> { backend -> { probe, width } }
  const errors = [];
  try {
    await Promise.all(
      BACKENDS.map(async (backend) => {
        const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
        await ctx.addInitScript(
          ([key, be]) => {
            try {
              localStorage.setItem(key, JSON.stringify({ version: 4, defaultBackend: be }));
            } catch {
              /* storage unavailable */
            }
          },
          [STORAGE_KEY, backend],
        );
        const page = await ctx.newPage();
        page.on("pageerror", (e) => errors.push(`${backend}: ${e.message}`));
        await page.goto(preview.url, { waitUntil: "networkidle" });
        for (const v of todo) {
          await page.goto(`${preview.url}${v.route}`, { waitUntil: "networkidle" });
          await page.waitForTimeout(400);
          for (const c of v.charts) {
            const card = page.locator(`#chart-${c.id}`).first();
            try {
              await card.waitFor({ timeout: 30000 });
              await card.scrollIntoViewIfNeeded();
              const got = await stableProbe(page, c.id);
              if (!results.has(c.id)) results.set(c.id, { spec: c, view: v.name, by: {} });
              results.get(c.id).by[backend] = got;
            } catch (e) {
              errors.push(`${backend} ${v.name} ${c.id}: ${e.message.split("\n")[0]}`);
            }
          }
        }
        await ctx.close();
      }),
    );
  } finally {
    await browser.close();
    preview.stop();
  }

  let failures = 0;
  const rows = [];
  for (const [id, r] of results) {
    const ref = r.by.echarts;
    const problems = [];
    if (!ref) problems.push("echarts: no probe");
    else if (r.spec.kind === "xy") {
      // The reference must itself draw what the spec says.
      const exp = expected(r.spec, ref.probe.height, ref.width, vm);
      const p = ref.probe;
      const frame = (h, v, labels) => ({ backend: "", kind: "xy", horizontal: p.horizontal, h, v, series: [], lines: 0, areas: 0, dots: 0, labels });
      for (const d of parity.compareProbes(frame(exp.h, exp.v, exp.labels), frame(p.h, p.v, p.labels))) problems.push(`echarts vs spec: ${d.what}: spec ${d.reference}, drawn ${d.got}`);
      for (const e of exp.series) {
        const s = p.series.find((x) => x.key === e.key);
        if (!s) problems.push(`echarts vs spec: series ${e.key} not drawn`);
        else if (s.count !== e.count) problems.push(`echarts vs spec: series ${e.key}: spec ${e.count} marks, drawn ${s.count}`);
      }
      for (const s of p.series) if (s.kind === "bar" && s.count > 0 && !(s.extent > 0)) problems.push(`echarts: series ${s.key} has ${s.count} bars but draws none`);
      for (const s of r.spec.series) if (s.band && !p.series.some((x) => x.key === `${s.field}~band` && x.count > 0)) problems.push(`echarts: band of ${s.field} not filled`);
    }
    for (const be of BACKENDS.slice(1)) {
      const got = r.by[be];
      if (!got) {
        problems.push(`${be}: no probe`);
        continue;
      }
      if (!ref) continue;
      for (const d of parity.compareProbes(ref.probe, got.probe)) problems.push(`${be}: ${d.what}: echarts ${d.reference}, ${be} ${d.got}`);
    }
    const summary = ref ? ref.probe.series.map((s) => `${s.kind}:${s.count}`).join(" ") : "";
    rows.push({ id, view: r.view, ok: problems.length === 0, summary, problems });
    if (problems.length) failures++;
  }
  rows.sort((a, b) => a.id.localeCompare(b.id));
  for (const r of rows) {
    log(`${r.ok ? "ok  " : "FAIL"} ${r.id.padEnd(22)} ${r.view.padEnd(20)} ${r.summary.slice(0, 90)}`);
    for (const p of r.problems) log(`       ${p}`);
  }
  const missing = [...new Set(todo.flatMap((v) => v.charts.map((c) => c.id)))].filter((id) => !results.has(id));
  for (const id of missing) log(`FAIL ${id}: never probed`);
  for (const e of errors) log(`ERROR ${e}`);
  const bad = failures + missing.length + errors.length;
  log(bad ? `\nParity failed: ${failures} chart(s) disagree, ${missing.length} not probed, ${errors.length} error(s).` : `\nParity holds: ${rows.length} charts × ${BACKENDS.length} backends.`);
  return bad ? 1 : 0;
}

run()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
