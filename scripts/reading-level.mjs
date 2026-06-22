import { readFileSync } from 'node:fs';
const src = readFileSync('code/app.js', 'utf8');
const start = src.indexOf('\n  en: {');
if (start === -1) throw new Error('en marker not found');
const slice = src.slice(start, src.indexOf('\n  },', start));
const strings = [...slice.matchAll(/:\s*['"]([^'"]{8,})['"]/g)].map(m => m[1]);

const syll = w => (w.toLowerCase().match(/[aeiouy]+/g) || []).length || 1;
function fk(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const sentences = (text.match(/[.!?]+/g) || ['.']).length;
  const syllables = words.reduce((s, w) => s + syll(w), 0);
  return 0.39 * (words.length / sentences) + 11.8 * (syllables / words.length) - 15.59;
}
const flagged = strings.map(s => ({ s, g: +fk(s).toFixed(1) }))
  .filter(x => x.g > 6).sort((a, b) => b.g - a.g);
console.log(`Strings above grade 6 (${flagged.length}):`);
flagged.slice(0, 40).forEach(x => console.log(`  [${x.g}] ${x.s}`));
process.exit(flagged.length ? 1 : 0);
