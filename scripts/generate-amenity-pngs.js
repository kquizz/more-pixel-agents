/**
 * Generate PNG sprites for amenity furniture (water cooler, coffee machine)
 * from their JSON sprite definitions.
 *
 * Usage: node scripts/generate-amenity-pngs.js
 */

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const SPRITES = [
  {
    json: 'webview-ui/src/office/sprites/water-cooler.json',
    out: 'webview-ui/public/assets/furniture/WATER_COOLER/WATER_COOLER.png',
  },
  {
    json: 'webview-ui/src/office/sprites/coffee-machine.json',
    out: 'webview-ui/public/assets/furniture/COFFEE_MACHINE/COFFEE_MACHINE.png',
  },
];

const root = path.resolve(__dirname, '..');

for (const { json, out } of SPRITES) {
  const data = JSON.parse(fs.readFileSync(path.join(root, json), 'utf-8'));
  const { width, height, palette, pixels } = data;

  const png = new PNG({ width, height });

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const key = pixels[y][x];
      const color = palette[key] || '';
      const idx = (y * width + x) * 4;

      if (!color) {
        // Transparent
        png.data[idx] = 0;
        png.data[idx + 1] = 0;
        png.data[idx + 2] = 0;
        png.data[idx + 3] = 0;
      } else {
        // Parse #RRGGBB or #RRGGBBAA
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        const a = color.length > 7 ? parseInt(color.slice(7, 9), 16) : 255;
        png.data[idx] = r;
        png.data[idx + 1] = g;
        png.data[idx + 2] = b;
        png.data[idx + 3] = a;
      }
    }
  }

  const outPath = path.join(root, out);
  const buffer = PNG.sync.write(png);
  fs.writeFileSync(outPath, buffer);
  console.log(`Generated ${out} (${width}x${height})`);
}
