// Find references to things that do not exist.
//
// Four bugs in two days were all this exact shape: a name referenced that is
// not defined anywhere. JavaScript and CSS both fail silently on these —
// getElementById returns null, a querySelector matches nothing, an unset custom
// property resolves to nothing — so they survive until a person notices the
// feature quietly doing nothing.
//
//   node scripts/dead-refs.mjs
import { readFileSync } from 'node:fs';

const html = readFileSync('code/index.html', 'utf8');
const jsRaw = readFileSync('code/app.js', 'utf8');
// Strip comments before scanning for calls — prose in comments matched the
// "word(" pattern and drowned the real findings in noise.
const js = jsRaw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const css  = readFileSync('code/styles.css', 'utf8');

const uniq = a => [...new Set(a)];
const all  = (re, s) => [...s.matchAll(re)].map(m => m[1]);
const problems = [];
const report = (kind, items, note) => {
  if (items.length) problems.push({ kind, note, items: items.sort() });
};

// 1. Inline handlers must be reachable on window.
const handlers = uniq(all(/on(?:click|change|input|keydown|mousedown|ended)="([a-zA-Z_$][\w$]*)\s*\(/g, html));
const exported = new Set(all(/^\s*([a-zA-Z_$][\w$]*)\s*,?\s*$/gm,
  js.slice(js.indexOf('Object.assign(window, {'))).concat(
  all(/([a-zA-Z_$][\w$]*)\s*,/g, js.slice(js.indexOf('Object.assign(window, {'), js.indexOf('Object.assign(window, {') + 4000))));
const KEYWORDS = new Set(['if','for','while','switch','return','void','typeof']);
report('inline handler not exported to window', handlers.filter(h => !exported.has(h) && !KEYWORDS.has(h)),
  'onclick="foo()" where foo never reaches window — the button does nothing');

// 2. Functions called in JS that are never defined (the loadPatients shape).
const defined = new Set([
  ...all(/(?:async\s+)?function\s+([a-zA-Z_$][\w$]*)\s*\(/g, js),
  ...all(/(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s*)?\(/g, js),
  ...all(/(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s*)?function/g, js),
]);
const BUILTIN = new Set(['if','for','while','switch','catch','return','typeof','await','function','constructor','super','new','delete','void','yield','then','catch','finally','map','filter','forEach','reduce','find','some','every','join','split','slice','push','set','get','has','add','sort','test','match','replace','trim','toString','parseInt','parseFloat','isNaN','Number','String','Boolean','Array','Object','JSON','Math','Date','Promise','console','document','window','setTimeout','setInterval','clearTimeout','clearInterval','fetch','alert','require','import','escapeHtml','t']);
const called = uniq(all(/(?:^|[^.\w$'"`])([a-zA-Z_$][\w$]{3,})\s*\(/g, js));
report('function called but never defined', called.filter(c =>
  !defined.has(c) && !BUILTIN.has(c) && !/^[A-Z]/.test(c) &&
  !js.includes(`${c} =`) && !js.includes(`${c}:`)).slice(0, 25),
  'may include false positives from imports and object methods — verify each');

// 3. CSS custom properties used but never declared (the --radius-md shape).
const usedVars = uniq(all(/var\(\s*(--[\w-]+)/g, css));
const declVars = new Set(all(/(--[\w-]+)\s*:/g, css));
// Some variables are set at runtime with style.setProperty — those are declared,
// just not in the stylesheet.
const runtimeVars = new Set(all(/setProperty\(\s*['"`](--[\w-]+)/g, jsRaw));
report('CSS variable used but never declared', usedVars.filter(v => !declVars.has(v) && !runtimeVars.has(v)),
  'resolves to nothing — silently renders as 0 / unset');

// 4. Class selectors styled or queried but present in no markup (the .si-chip shape).
const queried = uniq(all(/querySelector(?:All)?\(\s*['"`][^'"`]*?\.([\w-]+)/g, js));
const markup  = html + js;
report('class queried in JS but in no markup', queried.filter(c => !new RegExp(`class="[^"]*\\b${c}\\b`).test(markup) && !markup.includes(`'${c}'`) && !markup.includes(`classList.add('${c}`)),
  'selector matches nothing — the code runs and does nothing');

// 5. getElementById targets that exist in neither the HTML nor any JS template.
const ids = uniq(all(/getElementById\(\s*['"`]([\w-]+)['"`]/g, js));
report('getElementById target not found anywhere', ids.filter(id =>
  !html.includes(`id="${id}"`) && !js.includes(`id="${id}"`) && !js.includes(`id='${id}'`) && !js.includes('id="${')),
  'returns null — every guarded call silently no-ops');

if (!problems.length) { console.log('No dead references found.'); process.exit(0); }
for (const p of problems) {
  console.log(`\n=== ${p.kind} (${p.items.length}) ===`);
  console.log(`    ${p.note}`);
  p.items.forEach(i => console.log(`  - ${i}`));
}
