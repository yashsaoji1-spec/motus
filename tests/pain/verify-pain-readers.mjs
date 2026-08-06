// Extracts the REAL function source from code/app.js (no retyping) and exercises it.
import fs from 'fs';

const SRC = fs.readFileSync(process.argv[2], 'utf8');

function grab(startRe, name) {
  const i = SRC.search(startRe);
  if (i === -1) throw new Error('not found: ' + name);
  // brace-match from the first { after the signature
  let j = SRC.indexOf('{', i), depth = 0, k = j;
  for (; k < SRC.length; k++) {
    if (SRC[k] === '{') depth++;
    else if (SRC[k] === '}') { depth--; if (depth === 0) break; }
  }
  return SRC.slice(i, k + 1);
}

const parts = [
  grab(/const PAIN_BUCKETS = \[/, 'PAIN_BUCKETS').replace(/^const PAIN_BUCKETS = \{/, 'const PAIN_BUCKETS = ['),
  grab(/function normalizePain\(/, 'normalizePain'),
  grab(/function painBucketLabel\(/, 'painBucketLabel'),
  grab(/function sessionPainValue\(/, 'sessionPainValue'),
  grab(/function avgPainOf\(/, 'avgPainOf'),
];

// PAIN_BUCKETS is an array literal, brace-matching grabs the object; re-extract it.
const pbMatch = SRC.match(/const PAIN_BUCKETS = \[[\s\S]*?\];/);
parts[0] = pbMatch[0];

const t = (k) => k; // stub: returns the i18n key so we can assert on it
const fns = new Function('t', parts.join('\n') + '\nreturn {normalizePain,painBucketLabel,sessionPainValue,avgPainOf,PAIN_BUCKETS};')(t);

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
};

// The headline bug: a logged 0 must come back as 0, not 1.
const render = s => fns.sessionPainValue(s) === null ? '—' : fns.sessionPainValue(s) + '/10';
console.log('--- set-row display (the "|| 1" bug) ---');
eq('pain 0 renders 0/10', render({ pain: 0 }), '0/10');
eq('pain 7 renders 7/10', render({ pain: 7 }), '7/10');
eq('pain 10 renders 10/10', render({ pain: 10 }), '10/10');
eq('missing pain renders dash', render({ reps: 12 }), '—');

console.log('\n--- sessionPainValue: null is not zero ---');
eq('no pain field -> null', fns.sessionPainValue({ reps: 5 }), null);
eq('pain 0 -> 0', fns.sessionPainValue({ pain: 0 }), 0);
eq('setData avg 2 and 8 -> 5', fns.sessionPainValue({ setData: [{ pain: 2 }, { pain: 8 }] }), 5);
eq('setData skips missing, avg of 4 alone', fns.sessionPainValue({ setData: [{ pain: 4 }, { reps: 3 }] }), 4);
eq('setData all missing -> null', fns.sessionPainValue({ setData: [{ reps: 3 }, { reps: 5 }] }), null);

console.log('\n--- avgPainOf: "not recorded" must not average in as 0 ---');
eq('[8, no-data] -> 8 (not 4)', fns.avgPainOf([{ pain: 8 }, { reps: 1 }]), 8);
eq('[6,8] -> 7', fns.avgPainOf([{ pain: 6 }, { pain: 8 }]), 7);
eq('[0,0] -> 0 (real zeros DO count)', fns.avgPainOf([{ pain: 0 }, { pain: 0 }]), 0);
eq('all no-data -> null', fns.avgPainOf([{ reps: 1 }, { reps: 2 }]), null);
eq('empty -> null', fns.avgPainOf([]), null);

console.log('\n--- painBucketLabel: no data must not read as "not at all" ---');
eq('null -> dash', fns.painBucketLabel(null), '—');
eq('undefined -> dash', fns.painBucketLabel(undefined), '—');
eq('NaN (parseFloat("-")) -> dash', fns.painBucketLabel(parseFloat('-')), '—');
eq('0 -> notAtAll', fns.painBucketLabel(0), 'pain.notAtAll');
eq('8 -> aLot', fns.painBucketLabel(8), 'pain.aLot');

console.log('\n--- normalizePain is identity on current bucket values ---');
// Matters for the #6 migration: removing it later is a no-op for post-migration data.
[0, 2, 5, 8].forEach(v => eq(`normalizePain(${v}) === ${v}`, fns.normalizePain(v), v));
eq('normalizePain(null) -> null', fns.normalizePain(null), null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
