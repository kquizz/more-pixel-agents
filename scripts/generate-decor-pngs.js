#!/usr/bin/env node

const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SPRITES_DIR = path.join(ROOT, 'webview-ui/src/office/sprites');
const ASSETS_DIR = path.join(ROOT, 'webview-ui/public/assets/furniture');

const ITEMS = [
  { json: 'fish-tank.json', assetDir: 'FISH_TANK' },
  { json: 'fish-tank-2.json', assetDir: 'FISH_TANK_2' },
  { json: 'rug.json', assetDir: 'RUG' },
  { json: 'coat-rack.json', assetDir: 'COAT_RACK' },
  { json: 'printer.json', assetDir: 'PRINTER' },
  {
    json: 'widescreen-front-off.json',
    assetDir: 'WIDESCREEN',
    outFile: 'WIDESCREEN_FRONT_OFF.png',
  },
  {
    json: 'widescreen-front-on1.json',
    assetDir: 'WIDESCREEN',
    outFile: 'WIDESCREEN_FRONT_ON_1.png',
  },
  {
    json: 'widescreen-front-on2.json',
    assetDir: 'WIDESCREEN',
    outFile: 'WIDESCREEN_FRONT_ON_2.png',
  },
  {
    json: 'dual-monitor-front-off.json',
    assetDir: 'DUAL_MONITOR',
    outFile: 'DUAL_MONITOR_FRONT_OFF.png',
  },
  {
    json: 'dual-monitor-front-on1.json',
    assetDir: 'DUAL_MONITOR',
    outFile: 'DUAL_MONITOR_FRONT_ON_1.png',
  },
  { json: 'wide-whiteboard.json', assetDir: 'WIDE_WHITEBOARD', outFile: 'WIDE_WHITEBOARD.png' },
  { json: 'coffee-mug.json', assetDir: 'COFFEE_MUG', outFile: 'COFFEE_MUG.png' },
  { json: 'soda-can.json', assetDir: 'SODA_CAN', outFile: 'SODA_CAN.png' },
  { json: 'beer-bottle.json', assetDir: 'BEER_BOTTLE', outFile: 'BEER_BOTTLE.png' },
  { json: 'server-rack.json', assetDir: 'SERVER_RACK', outFile: 'SERVER_RACK.png' },
  { json: 'desk-lamp.json', assetDir: 'DESK_LAMP', outFile: 'DESK_LAMP.png' },
  { json: 'rubber-duck.json', assetDir: 'RUBBER_DUCK', outFile: 'RUBBER_DUCK.png' },
  { json: 'triple-monitor.json', assetDir: 'TRIPLE_MONITOR', outFile: 'TRIPLE_MONITOR.png' },
  { json: 'standing-desk.json', assetDir: 'STANDING_DESK', outFile: 'STANDING_DESK.png' },
  { json: 'big-fish-tank.json', assetDir: 'BIG_FISH_TANK', outFile: 'BIG_FISH_TANK.png' },
  { json: 'big-fish-tank-2.json', assetDir: 'BIG_FISH_TANK_2', outFile: 'BIG_FISH_TANK_2.png' },
  {
    json: 'widescreen-front-on1.json',
    assetDir: 'WIDESCREEN',
    outFile: 'WIDESCREEN_FRONT_ON_1.png',
  },
  {
    json: 'widescreen-front-on2.json',
    assetDir: 'WIDESCREEN',
    outFile: 'WIDESCREEN_FRONT_ON_2.png',
  },
  {
    json: 'dual-monitor-front-on1.json',
    assetDir: 'DUAL_MONITOR',
    outFile: 'DUAL_MONITOR_FRONT_ON_1.png',
  },
  {
    json: 'triple-monitor-on1.json',
    assetDir: 'TRIPLE_MONITOR',
    outFile: 'TRIPLE_MONITOR_ON_1.png',
  },
  {
    json: 'triple-monitor-on2.json',
    assetDir: 'TRIPLE_MONITOR',
    outFile: 'TRIPLE_MONITOR_ON_2.png',
  },
  { json: 'arcade-cabinet.json', assetDir: 'ARCADE_CABINET', outFile: 'ARCADE_CABINET.png' },
  { json: 'snack-machine.json', assetDir: 'SNACK_MACHINE', outFile: 'SNACK_MACHINE.png' },
  { json: 'window-day.json', assetDir: 'WINDOW', outFile: 'WINDOW.png' },
  { json: 'ping-pong-table.json', assetDir: 'PING_PONG_TABLE', outFile: 'PING_PONG_TABLE.png' },
  { json: 'neon-sign.json', assetDir: 'NEON_SIGN', outFile: 'NEON_SIGN.png' },
  {
    json: 'motivational-poster.json',
    assetDir: 'MOTIVATIONAL_POSTER',
    outFile: 'MOTIVATIONAL_POSTER.png',
  },
  { json: 'trophy-case.json', assetDir: 'TROPHY_CASE', outFile: 'TROPHY_CASE.png' },
  {
    json: 'laptop-standalone.json',
    assetDir: 'LAPTOP_STANDALONE',
    outFile: 'LAPTOP_STANDALONE.png',
  },
  { json: 'tablet-stand.json', assetDir: 'TABLET_STAND', outFile: 'TABLET_STAND.png' },
  { json: 'smart-speaker.json', assetDir: 'SMART_SPEAKER', outFile: 'SMART_SPEAKER.png' },
  { json: 'drone.json', assetDir: 'DRONE', outFile: 'DRONE.png' },
  { json: 'phone-booth.json', assetDir: 'PHONE_BOOTH', outFile: 'PHONE_BOOTH.png' },
  { json: 'microwave.json', assetDir: 'MICROWAVE', outFile: 'MICROWAVE.png' },
  { json: 'mini-fridge.json', assetDir: 'MINI_FRIDGE', outFile: 'MINI_FRIDGE.png' },
  { json: 'pizza-box.json', assetDir: 'PIZZA_BOX', outFile: 'PIZZA_BOX.png' },
  { json: 'donuts-box.json', assetDir: 'DONUTS_BOX', outFile: 'DONUTS_BOX.png' },
  { json: 'company-logo.json', assetDir: 'COMPANY_LOGO', outFile: 'COMPANY_LOGO.png' },
  {
    json: 'whiteboard-markers.json',
    assetDir: 'WHITEBOARD_MARKERS',
    outFile: 'WHITEBOARD_MARKERS.png',
  },
  { json: 'ac-unit.json', assetDir: 'AC_UNIT', outFile: 'AC_UNIT.png' },
  { json: 'ceiling-fan.json', assetDir: 'CEILING_FAN', outFile: 'CEILING_FAN.png' },
  {
    json: 'fire-extinguisher.json',
    assetDir: 'FIRE_EXTINGUISHER',
    outFile: 'FIRE_EXTINGUISHER.png',
  },
  { json: 'meeting-table.json', assetDir: 'MEETING_TABLE', outFile: 'MEETING_TABLE.png' },
];

function spriteToPng(spriteJsonPath, outputPath) {
  const data = JSON.parse(fs.readFileSync(spriteJsonPath, 'utf-8'));
  const palette = data.palette;
  const rawPixels = data.pixels;
  const height = rawPixels.length;
  const width = rawPixels[0].length;

  // Resolve palette keys to hex colors
  const pixels = rawPixels.map((row) =>
    row.map((key) => {
      if (palette.hasOwnProperty(key)) {
        return palette[key]; // "" for transparent
      }
      return key; // raw hex color
    }),
  );

  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const hex = pixels[y][x];
      if (!hex) {
        // Transparent
        png.data[idx] = 0;
        png.data[idx + 1] = 0;
        png.data[idx + 2] = 0;
        png.data[idx + 3] = 0;
      } else {
        png.data[idx] = parseInt(hex.slice(1, 3), 16);
        png.data[idx + 1] = parseInt(hex.slice(3, 5), 16);
        png.data[idx + 2] = parseInt(hex.slice(5, 7), 16);
        png.data[idx + 3] = 255;
      }
    }
  }

  const buffer = PNG.sync.write(png);
  fs.writeFileSync(outputPath, buffer);
  console.log(`  wrote ${outputPath} (${width}x${height})`);
}

console.log('Generating decorative furniture PNGs...\n');

for (const item of ITEMS) {
  const jsonPath = path.join(SPRITES_DIR, item.json);
  const outDir = path.join(ASSETS_DIR, item.assetDir);
  const outPath = path.join(outDir, item.outFile || `${item.assetDir}.png`);

  if (!fs.existsSync(jsonPath)) {
    console.error(`  SKIP: ${jsonPath} not found`);
    continue;
  }

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  spriteToPng(jsonPath, outPath);
}

console.log('\nDone!');
