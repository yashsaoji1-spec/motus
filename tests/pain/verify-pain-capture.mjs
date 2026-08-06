// Runs the REAL siInitPainGrid / siSelectPain source from app.js against a DOM stub.
import fs from 'fs';
const SRC = fs.readFileSync(process.argv[2], 'utf8');

function grab(re) {
  const i = SRC.search(re);
  if (i === -1) throw new Error('not found: ' + re);
  let j = SRC.indexOf('{', i), depth = 0, k = j;
  for (; k < SRC.length; k++) {
    if (SRC[k] === '{') depth++;
    else if (SRC[k] === '}') { depth--; if (depth === 0) break; }
  }
  return SRC.slice(i, k + 1);
}

const PAIN_MAX = Number(SRC.match(/const PAIN_MAX = (\d+)/)[1]);
const HIGH_PAIN = Number(SRC.match(/const HIGH_PAIN = (\d+)/)[1]);
const src = [
  SRC.match(/const PAIN_BUCKETS = \[[\s\S]*?\];/)[0],
  grab(/function normalizePain\(/),
  grab(/function painBucketLabel\(/),
  grab(/function siInitPainGrid\(/),
  grab(/function siSelectPain\(/),
].join('\n');

const mkClassList = () => ({ _s: new Set(),
  toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); },
  contains(c) { return this._s.has(c); } });

function mkEl(id) {
  const o = { id, _tc: '', value: '', innerHTML: '', childElementCount: 0,
    classList: mkClassList(), attrs: {}, style: { _p: {},
      setProperty(k, v) { this._p[k] = v; }, getPropertyValue(k) { return this._p[k]; } },
    setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; } };
  Object.defineProperty(o, 'textContent', {
    get() { return this._tc; }, set(v) { this._tc = String(v); } });
  return o;
}

const els = {
  setInputPain: mkEl('setInputPain'),
  siPainNum: mkEl('siPainNum'),
  siPainWord: mkEl('siPainWord'),
  siPainRange: mkEl('siPainRange'),
  siPainChip: mkEl('siPainChip'),
  siPainButtons: mkEl('siPainButtons'),
  ticks: mkEl('ticks'),
};
// innerHTML on the ticks container should update childElementCount like a real DOM.
Object.defineProperty(els.ticks, 'innerHTML', {
  get() { return this._h || ''; },
  set(v) { this._h = v; this.childElementCount = (v.match(/<i>/g) || []).length; },
});

const document = {
  getElementById: (id) => els[id] || null,
  querySelector: (s) => s === '#siPainButtons .rd-pain-ticks' ? els.ticks : null,
  querySelectorAll: () => [],
};
const t = (k) => ({ 'pain.notAtAll': 'Not at all', 'pain.aLittle': 'A little',
  'pain.quiteABit': 'Quite a bit', 'pain.aLot': 'A lot' }[k] || k);

const fns = new Function('document', 't', 'PAIN_MAX', 'HIGH_PAIN',
  src + '\nreturn {siInitPainGrid, siSelectPain};')(document, t, PAIN_MAX, HIGH_PAIN);

let pass = 0, fail = 0;
const eq = (l, g, w) => { const ok = JSON.stringify(g) === JSON.stringify(w); ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${l}${ok ? '' : `\n        got=${JSON.stringify(g)} want=${JSON.stringify(w)}`}`); };

console.log('--- scale definition ---');
eq('PAIN_MAX is 10', PAIN_MAX, 10);
eq('HIGH_PAIN is 7', HIGH_PAIN, 7);

fns.siInitPainGrid();
console.log('\n--- init ---');
eq('renders one tick per stop (11)', els.ticks.childElementCount, PAIN_MAX + 1);
eq('init defaults to 0', els.setInputPain.value, 0);

console.log('\n--- every whole number 0..10 round-trips ---');
for (let v = 0; v <= PAIN_MAX; v++) {
  fns.siSelectPain(v);
  eq(`select ${v} -> stored ${v}`, els.setInputPain.value, v);
  eq(`select ${v} -> readout "${v}"`, els.siPainNum.textContent, String(v));
  eq(`select ${v} -> slider at ${v}`, Number(els.siPainRange.value), v);
}

console.log('\n--- 7 is distinguishable from 10 (the point of #6) ---');
fns.siSelectPain(7);
const at7 = { v: els.setInputPain.value, pct: els.siPainRange.style.getPropertyValue('--pain-pct') };
fns.siSelectPain(10);
const at10 = { v: els.setInputPain.value, pct: els.siPainRange.style.getPropertyValue('--pain-pct') };
eq('7 and 10 store different values', at7.v !== at10.v, true);
eq('7 fills 70%', at7.pct, '70%');
eq('10 fills 100%', at10.pct, '100%');

console.log('\n--- high-pain styling threshold ---');
fns.siSelectPain(6);  eq('6 is not danger', els.siPainChip.classList.contains('danger'), false);
fns.siSelectPain(7);  eq('7 is danger', els.siPainChip.classList.contains('danger'), true);
fns.siSelectPain(10); eq('10 is danger', els.siPainChip.classList.contains('danger'), true);

console.log('\n--- clamping ---');
fns.siSelectPain(99);  eq('99 clamps to 10', els.setInputPain.value, 10);
fns.siSelectPain(-5);  eq('-5 clamps to 0', els.setInputPain.value, 0);
fns.siSelectPain('x'); eq('non-numeric falls to 0', els.setInputPain.value, 0);

console.log('\n--- label tracks the number ---');
fns.siSelectPain(0); eq('0 -> "Not at all"', els.siPainWord.textContent, 'Not at all');
fns.siSelectPain(2); eq('2 -> "A little"', els.siPainWord.textContent, 'A little');
fns.siSelectPain(5); eq('5 -> "Quite a bit"', els.siPainWord.textContent, 'Quite a bit');
fns.siSelectPain(9); eq('9 -> "A lot"', els.siPainWord.textContent, 'A lot');

console.log('\n--- screen-reader value ---');
fns.siSelectPain(9);
eq('aria-valuetext spells out the value', els.siPainRange.getAttribute('aria-valuetext'), '9 out of 10, A lot');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
