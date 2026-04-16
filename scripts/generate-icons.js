// Generates icon-192.png and icon-512.png from the Motus SVG logo mark.
// Run once: node scripts/generate-icons.js
// Output: code/public/icons/

import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'code', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="20" fill="#0B6CB0"/>
  <path d="M50 20c-2 0-3.5 1.5-3.5 3.5V55c0 2 1.5 3.5 3.5 3.5s3.5-1.5 3.5-3.5V23.5C53.5 21.5 52 20 50 20zM36 28c-2 0-3.5 1.5-3.5 3.5V55c0 2 1.5 3.5 3.5 3.5s3.5-1.5 3.5-3.5V31.5C39.5 29.5 38 28 36 28zM64 28c-2 0-3.5 1.5-3.5 3.5V55c0 2 1.5 3.5 3.5 3.5s3.5-1.5 3.5-3.5V31.5C67.5 29.5 66 28 64 28zM25 40c-2 0-3.5 1.5-3.5 3.5V60c0 8 6.5 20 28.5 20s28.5-12 28.5-20V43.5c0-2-1.5-3.5-3.5-3.5s-3.5 1.5-3.5 3.5V55c0 2-1.5 3.5-3.5 3.5" fill="white" opacity="0.9"/>
</svg>`;

const svgBuffer = Buffer.from(svg);

for (const size of [192, 512]) {
  await sharp(svgBuffer)
    .resize(size, size)
    .png()
    .toFile(join(outDir, `icon-${size}.png`));
  console.log(`icon-${size}.png written`);
}
