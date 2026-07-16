import { readFileSync } from 'node:fs';
const src = readFileSync('code/app.js', 'utf8');

function keysIn(langMarker) {
  // slice from `  en: {` / `  es: {` to the line that closes that top-level block.
  const start = src.indexOf(`\n  ${langMarker}: {`);
  if (start === -1) throw new Error(`marker ${langMarker} not found`);
  const slice = src.slice(start, src.indexOf('\n  },', start));
  return new Set([...slice.matchAll(/^\s*['"]([\w.]+)['"]\s*:/gm)].map(m => m[1]));
}

const en = keysIn('en'), es = keysIn('es');
const missingEs = [...en].filter(k => !es.has(k));
const missingEn = [...es].filter(k => !en.has(k));

const html = readFileSync('code/index.html', 'utf8');
// crude hardcoded-text scan: text nodes >2 chars in elements lacking data-i18n
const hardcoded = [...html.matchAll(/>([A-Za-z][A-Za-z ,.'!?]{2,})</g)]
  .map(m => m[1].trim())
  .filter(t => !/^(px|rem|http)/.test(t));

// Spanish is currently NOT offered (SPANISH_ENABLED = false in code/app.js). While
// it's off, a missing `es` key is expected — failing on it would pressure whoever
// runs this into writing unreviewed Spanish medical/legal copy, which is exactly
// what the flag exists to prevent. Report it, don't fail on it. Missing `en` keys
// are still a hard failure (that's a real bug in the shipping language).
const spanishOffered = /const\s+SPANISH_ENABLED\s*=\s*true/.test(src);

console.log('Missing in es:', missingEs);
console.log('Missing in en:', missingEn);
console.log('Possible hardcoded HTML strings (review):', [...new Set(hardcoded)].slice(0, 50));

if (!spanishOffered && missingEs.length) {
  console.log(`\nNote: Spanish is disabled (SPANISH_ENABLED = false), so ${missingEs.length} missing es key(s) are NOT a failure. Re-enable the flag to enforce parity again.`);
}
const failed = missingEn.length || (spanishOffered && missingEs.length);
process.exit(failed ? 1 : 0);
