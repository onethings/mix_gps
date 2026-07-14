// Generate SVG sprite sheet from public/markers/ with SVGO optimization
// Run before build: node scripts/generate-sprite.js
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { optimize } from 'svgo';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MARKERS_DIR = join(__dirname, '..', 'public', 'markers');
const OUTPUT = join(MARKERS_DIR, 'sprite.svg');

const SVGO_CONFIG = {
  multipass: true,
  plugins: [
    { name: 'removeXMLProcInst', active: true },
    { name: 'removeDoctype', active: true },
    { name: 'removeComments', active: true },
    { name: 'removeMetadata', active: true },
    { name: 'cleanupAttrs', active: true },
    { name: 'mergeStyles', active: true },
    { name: 'inlineStyles', active: true },
    { name: 'minifyStyles', active: true },
    { name: 'removeUnusedNS', active: true },
    { name: 'cleanupIds', active: true },
    { name: 'removeEmptyAttrs', active: true },
    { name: 'removeEmptyContainers', active: true },
    { name: 'collapseGroups', active: true },
    { name: 'convertColors', active: true },
    { name: 'convertPathData', active: false }, // keep readable paths
    { name: 'convertTransform', active: true },
    { name: 'removeUnknownsAndDefaults', active: true },
    { name: 'removeEmptyText', active: true },
    { name: 'removeHiddenElems', active: true },
    { name: 'sortAttrs', active: true },
  ],
};

function extractSvgContent(filePath) {
  const raw = readFileSync(filePath, 'utf-8');
  // Optimize each source SVG first
  const result = optimize(raw, { ...SVGO_CONFIG, path: filePath });
  const content = result.data;
  const svgMatch = content.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
  if (!svgMatch) return null;
  return svgMatch[1].trim();
}

function extractViewBox(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const vbMatch = content.match(/viewBox="([^"]+)"/i);
  return vbMatch ? vbMatch[1] : '0 0 96 96';
}

function buildSprite() {
  const files = readdirSync(MARKERS_DIR)
    .filter((f) => f.endsWith('.svg') && f !== 'sprite.svg')
    .sort();

  let symbols = '';
  let count = 0;
  let originalSize = 0;
  let optimizedSize = 0;

  for (const file of files) {
    const filePath = join(MARKERS_DIR, file);
    if (!statSync(filePath).isFile()) continue;

    const name = file.replace(/\.svg$/i, '');
    const viewBox = extractViewBox(filePath);
    const inner = extractSvgContent(filePath);
    originalSize += statSync(filePath).size;

    if (inner) {
      const symbol = `<symbol id="${name}" viewBox="${viewBox}">\n    ${inner}\n  </symbol>`;
      symbols += `  ${symbol}\n`;
      optimizedSize += Buffer.byteLength(symbol, 'utf-8');
      count++;
    }
  }

  const sprite = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" style="display:none">\n${symbols}</svg>\n`;

  writeFileSync(OUTPUT, sprite, 'utf-8');

  const finalSize = statSync(OUTPUT).size;
  const savings = ((1 - finalSize / originalSize) * 100).toFixed(1);
  console.log(`[sprite] Generated ${OUTPUT}`);
  console.log(`[sprite] ${count}/${files.length} symbols`);
  console.log(`[sprite] Original: ${(originalSize / 1024).toFixed(0)} KB → Final: ${(finalSize / 1024).toFixed(0)} KB (${savings}% savings)`);
}

buildSprite();
