// tools/verify.mjs — the entry gate, run locally. Parses every module as ESM, walks the import
// graph from index.html, checks every reference resolves to a file inside game/, refuses a network
// string outside the vendored three.js, and reports the file and byte budgets.
//   node tools/verify.mjs
import { readFileSync, readdirSync, statSync, lstatSync, existsSync } from 'node:fs';
import { join, relative, dirname, resolve, sep } from 'node:path';
import vm from 'node:vm';

const ROOT = resolve('.');
const GAME = join(ROOT, 'game');
let failures = 0;
const say = (ok, msg, extra = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}${extra ? ' — ' + extra : ''}`);
};

// ---- 1. walk game/ -------------------------------------------------------------------------
function walk(dir, base = dir, out = { files: [], dirs: 0 }) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = lstatSync(p);
    if (s.isSymbolicLink()) { say(false, `symlink in game/: ${relative(base, p)}`); continue; }
    if (s.isDirectory()) { out.dirs += 1; walk(p, base, out); } else out.files.push({ rel: relative(base, p).split(sep).join('/'), size: s.size });
  }
  return out;
}
const tree = walk(GAME);
const entries = tree.files.length + tree.dirs;
const bytes = tree.files.reduce((n, f) => n + f.size, 0);
say(entries <= 993, `game/ entries ${entries} <= 993`);
say(bytes <= 48 * 1024 * 1024, `game/ bytes ${(bytes / 1048576).toFixed(2)} MiB <= 48`);
const indexSize = statSync(join(GAME, 'index.html')).size;
say(indexSize <= 1024 * 1024, `index.html ${indexSize} B <= 1 MiB`);

// ---- 2. imports are relative or mapped, and resolve ----------------------------------------
const html = readFileSync(join(GAME, 'index.html'), 'utf8');
const maps = html.match(/<script type="importmap">([\s\S]*?)<\/script>/g) || [];
say(maps.length === 1, `exactly one importmap (found ${maps.length})`);
const importMap = JSON.parse(maps[0].replace(/<[^>]+>/g, ''));
say(Object.keys(importMap.imports).length >= 1 && importMap.imports.three !== undefined, 'importmap maps "three"');
say(importMap.scopes === undefined, 'importmap has no scopes key');

const SRC = /\.(js|mjs)$/;
const sources = tree.files.filter((f) => SRC.test(f.rel) && !f.rel.startsWith('vendor/') && !/\.min\.(js|mjs)$/.test(f.rel));
const seen = new Set();
const queue = [];

// module scripts in the page
const inlineScripts = [...html.matchAll(/<script type="module"([^>]*)>([\s\S]*?)<\/script>/g)];
const srcScripts = [...html.matchAll(/<script type="module"[^>]*src="([^"]+)"/g)].map((m) => m[1]);

const modules = [];
function resolveSpec(spec, fromRel) {
  if (spec.startsWith('./') || spec.startsWith('../')) {
    const abs = resolve(dirname(join(GAME, fromRel)), spec);
    const rel = relative(GAME, abs).split(sep).join('/');
    if (rel.startsWith('..')) return null;
    return rel;
  }
  if (importMap.imports[spec]) {
    const v = importMap.imports[spec];
    return relative(GAME, resolve(GAME, v)).split(sep).join('/');
  }
  return null;
}

const SPEC = /(?:^|[\s;}])(?:import|export)\s+(?:[^'"]*?\sfrom\s*)?['"]([^'"]+)['"]/g;
function parse(source, name) {
  try {
    const m = new vm.SourceTextModule(source, { identifier: name });
    return m.dependencySpecifiers;
  } catch (err) {
    say(false, `${name} does not parse as an ES module`, err.message);
    return [];
  }
}

for (const src of srcScripts) {
  const rel = src.replace(/^\.\//, '');
  if (!existsSync(join(GAME, rel))) { say(false, `index.html imports missing ${rel}`); continue; }
  queue.push(rel);
}
while (queue.length) {
  const rel = queue.shift();
  if (seen.has(rel)) continue;
  seen.add(rel);
  const text = readFileSync(join(GAME, rel), 'utf8');
  const deps = parse(text, rel);
  const lexical = [...text.matchAll(SPEC)].map((m) => m[1]);
  const vendored = rel.startsWith('vendor/') || /\.min\.(js|mjs)$/.test(rel);
  if (!vendored) modules.push({ rel, lines: text.split('\n').length, bytes: Buffer.byteLength(text) });
  for (const spec of deps) {
    const target = resolveSpec(spec, rel);
    if (!target) { say(false, `${rel} imports "${spec}" which is neither relative nor mapped`); continue; }
    if (!existsSync(join(GAME, target))) { say(false, `${rel} imports missing file ${target}`); continue; }
    queue.push(target);
  }
  const missing = lexical.filter((s) => !deps.includes(s));
  if (missing.length) say(false, `${rel} has a lexical import the parser missed: ${missing.join(', ')}`);
}
say(true, `import graph: ${modules.length} modules reachable from index.html`);

const unreached = sources.filter((f) => !seen.has(f.rel));
say(unreached.length === 0, 'no orphan modules in src/', unreached.map((f) => f.rel).join(' '));

// ---- 3. no network strings outside vendor --------------------------------------------------
const NET = /https?:\/\//;
const offenders = [];
for (const f of tree.files) {
  if (f.rel.startsWith('vendor/')) continue;
  const t = readFileSync(join(GAME, f.rel), 'utf8');
  t.split('\n').forEach((line, i) => { if (NET.test(line)) offenders.push(`${f.rel}:${i + 1}`); });
}
say(offenders.length === 0, 'no http/https reference outside vendor/', offenders.join(' '));

// ---- 4. vendored three is untouched and is 0.187.0 ----------------------------------------
const threePath = join(GAME, 'vendor/three/three.module.min.js');
const threeCore = join(GAME, 'vendor/three/three.core.min.js');
say(existsSync(threePath) && existsSync(threeCore), 'both vendored three files exist');
const threeText = readFileSync(threeCore, 'utf8');
const m = threeText.match(/REVISION\s*=\s*['"]([^'"]+)['"]/);
say(!!m && m[1] === '187', 'vendored three.js REVISION', m ? m[1] : 'not found');

// ---- 5. report ----------------------------------------------------------------------------
console.log('\nmodule                                 lines   bytes');
for (const mod of modules) console.log(`${mod.rel.padEnd(38)} ${String(mod.lines).padStart(5)} ${String(mod.bytes).padStart(7)}`);
console.log(`${'TOTAL'.padEnd(38)} ${String(modules.reduce((n, x) => n + x.lines, 0)).padStart(5)} ${String(modules.reduce((n, x) => n + x.bytes, 0)).padStart(7)}`);
const htmlBytes = Buffer.byteLength(html);
console.log(`index.html${' '.repeat(28)} ${String(html.split('\n').length).padStart(5)} ${String(htmlBytes).padStart(7)}`);
console.log(`\nsource bytes in dossier text: ${modules.reduce((n, x) => n + x.bytes, 0) + htmlBytes} / 163840`);

console.log(failures === 0 ? '\nGATE OK' : `\n${failures} PROBLEM(S)`);
process.exit(failures === 0 ? 0 : 1);
