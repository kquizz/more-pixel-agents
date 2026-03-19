import { adjustSprite } from '../colorize.js';
import type { Direction, FloorColor, SpriteData } from '../types.js';
import { Direction as Dir } from '../types.js';
import beerBottleData from './beer-bottle.json';
import bubbleAlertData from './bubble-alert.json';
import bubbleConfusedData from './bubble-confused.json';
import bubbleHandData from './bubble-hand.json';
import bubbleHeartData from './bubble-heart.json';
import bubbleIdeaData from './bubble-idea.json';
import bubblePermissionData from './bubble-permission.json';
import bubbleSleepData from './bubble-sleep.json';
import bubbleSweatData from './bubble-sweat.json';
import bubbleWaitingData from './bubble-waiting.json';
import coffeeMachineData from './coffee-machine.json';
import coffeeMugData from './coffee-mug.json';
import fireData1 from './fire.json';
import fireData2 from './fire-2.json';
import laptopData from './laptop.json';
import sodaCanData from './soda-can.json';
import waterCoolerData from './water-cooler.json';

// ── Speech Bubble Sprites ───────────────────────────────────────

interface BubbleSpriteJson {
  palette: Record<string, string>;
  pixels: string[][];
}

function resolveBubbleSprite(data: BubbleSpriteJson): SpriteData {
  return data.pixels.map((row) => row.map((key) => data.palette[key] ?? key));
}

/** Permission bubble: raised hand (asking for approval) (11x13) */
export const BUBBLE_PERMISSION_SPRITE: SpriteData = resolveBubbleSprite(bubbleHandData);

/** Permission bubble (legacy): white square with "..." in amber (11x13) */
export const BUBBLE_PERMISSION_DOTS_SPRITE: SpriteData = resolveBubbleSprite(bubblePermissionData);

/** Waiting bubble: white square with green checkmark, and a tail pointer (11x13) */
export const BUBBLE_WAITING_SPRITE: SpriteData = resolveBubbleSprite(bubbleWaitingData);

/** Sleep bubble: white square with 'zzZ' in blue (11x13) */
export const BUBBLE_SLEEP_SPRITE: SpriteData = resolveBubbleSprite(bubbleSleepData);

/** Alert bubble: white square with red '!' (11x13) */
export const BUBBLE_ALERT_SPRITE: SpriteData = resolveBubbleSprite(bubbleAlertData);

/** Confused bubble: white square with purple '?' (11x13) */
export const BUBBLE_CONFUSED_SPRITE: SpriteData = resolveBubbleSprite(bubbleConfusedData);

/** Sweat/stress bubble: white square with blue sweat drop (11x13) */
export const BUBBLE_SWEAT_SPRITE: SpriteData = resolveBubbleSprite(bubbleSweatData);

/** Idea/lightbulb bubble: white square with yellow lightbulb (11x13) */
export const BUBBLE_IDEA_SPRITE: SpriteData = resolveBubbleSprite(bubbleIdeaData);

/** Heart/happy bubble: white square with red heart (11x13) */
export const BUBBLE_HEART_SPRITE: SpriteData = resolveBubbleSprite(bubbleHeartData);

/** Small open laptop sprite for sub-agents (10x7) */
export const LAPTOP_SPRITE: SpriteData = resolveBubbleSprite(laptopData);

/** Water cooler sprite for office break area (10x16) */
export const WATER_COOLER_SPRITE: SpriteData = resolveBubbleSprite(waterCoolerData);

/** Coffee machine sprite for office break area (10x12) */
export const COFFEE_MACHINE_SPRITE: SpriteData = resolveBubbleSprite(coffeeMachineData);

/** Fire sprites for CI failure effects (2 animation frames) */
export const FIRE_SPRITES: SpriteData[] = [
  resolveBubbleSprite(fireData1),
  resolveBubbleSprite(fireData2),
];

/** Time-based desk drink sprites */
export const COFFEE_MUG_SPRITE: SpriteData = resolveBubbleSprite(coffeeMugData);
export const SODA_CAN_SPRITE: SpriteData = resolveBubbleSprite(sodaCanData);
export const BEER_BOTTLE_SPRITE: SpriteData = resolveBubbleSprite(beerBottleData);

// ════════════════════════════════════════════════════════════════
// Loaded character sprites (from PNG assets)
// ════════════════════════════════════════════════════════════════

interface LoadedCharacterData {
  down: SpriteData[];
  up: SpriteData[];
  right: SpriteData[];
}

let loadedCharacters: LoadedCharacterData[] | null = null;

/** Set pre-colored character sprites loaded from PNG assets. Call this when characterSpritesLoaded message arrives. */
export function setCharacterTemplates(data: LoadedCharacterData[]): void {
  loadedCharacters = data;
  // Clear cache so sprites are rebuilt from loaded data
  spriteCache.clear();
}

/** Flip a SpriteData horizontally (for generating left sprites from right) */
export function flipSpriteHorizontal(sprite: SpriteData): SpriteData {
  return sprite.map((row) => [...row].reverse());
}

// ════════════════════════════════════════════════════════════════
// Sprite resolution + caching
// ════════════════════════════════════════════════════════════════

export interface CharacterSprites {
  walk: Record<Direction, [SpriteData, SpriteData, SpriteData, SpriteData]>;
  typing: Record<Direction, [SpriteData, SpriteData]>;
  reading: Record<Direction, [SpriteData, SpriteData]>;
}

const spriteCache = new Map<string, CharacterSprites>();

/** Apply hue shift to every sprite in a CharacterSprites set */
function hueShiftSprites(sprites: CharacterSprites, hueShift: number): CharacterSprites {
  const color: FloorColor = { h: hueShift, s: 0, b: 0, c: 0 };
  const shift = (s: SpriteData) => adjustSprite(s, color);
  const shiftWalk = (
    arr: [SpriteData, SpriteData, SpriteData, SpriteData],
  ): [SpriteData, SpriteData, SpriteData, SpriteData] => [
    shift(arr[0]),
    shift(arr[1]),
    shift(arr[2]),
    shift(arr[3]),
  ];
  const shiftPair = (arr: [SpriteData, SpriteData]): [SpriteData, SpriteData] => [
    shift(arr[0]),
    shift(arr[1]),
  ];
  return {
    walk: {
      [Dir.DOWN]: shiftWalk(sprites.walk[Dir.DOWN]),
      [Dir.UP]: shiftWalk(sprites.walk[Dir.UP]),
      [Dir.RIGHT]: shiftWalk(sprites.walk[Dir.RIGHT]),
      [Dir.LEFT]: shiftWalk(sprites.walk[Dir.LEFT]),
    } as Record<Direction, [SpriteData, SpriteData, SpriteData, SpriteData]>,
    typing: {
      [Dir.DOWN]: shiftPair(sprites.typing[Dir.DOWN]),
      [Dir.UP]: shiftPair(sprites.typing[Dir.UP]),
      [Dir.RIGHT]: shiftPair(sprites.typing[Dir.RIGHT]),
      [Dir.LEFT]: shiftPair(sprites.typing[Dir.LEFT]),
    } as Record<Direction, [SpriteData, SpriteData]>,
    reading: {
      [Dir.DOWN]: shiftPair(sprites.reading[Dir.DOWN]),
      [Dir.UP]: shiftPair(sprites.reading[Dir.UP]),
      [Dir.RIGHT]: shiftPair(sprites.reading[Dir.RIGHT]),
      [Dir.LEFT]: shiftPair(sprites.reading[Dir.LEFT]),
    } as Record<Direction, [SpriteData, SpriteData]>,
  };
}

/** Create a transparent placeholder sprite of given dimensions */
function emptySprite(w: number, h: number): SpriteData {
  const rows: string[][] = [];
  for (let y = 0; y < h; y++) {
    rows.push(new Array(w).fill(''));
  }
  return rows;
}

export function getCharacterSprites(paletteIndex: number, hueShift = 0): CharacterSprites {
  const cacheKey = `${paletteIndex}:${hueShift}`;
  const cached = spriteCache.get(cacheKey);
  if (cached) return cached;

  let sprites: CharacterSprites;

  if (loadedCharacters) {
    // Use pre-colored character sprites directly (no palette swapping)
    const char = loadedCharacters[paletteIndex % loadedCharacters.length];
    const d = char.down;
    const u = char.up;
    const rt = char.right;
    const flip = flipSpriteHorizontal;

    sprites = {
      walk: {
        [Dir.DOWN]: [d[0], d[1], d[2], d[1]],
        [Dir.UP]: [u[0], u[1], u[2], u[1]],
        [Dir.RIGHT]: [rt[0], rt[1], rt[2], rt[1]],
        [Dir.LEFT]: [flip(rt[0]), flip(rt[1]), flip(rt[2]), flip(rt[1])],
      },
      typing: {
        [Dir.DOWN]: [d[3], d[4]],
        [Dir.UP]: [u[3], u[4]],
        [Dir.RIGHT]: [rt[3], rt[4]],
        [Dir.LEFT]: [flip(rt[3]), flip(rt[4])],
      },
      reading: {
        [Dir.DOWN]: [d[5], d[6]],
        [Dir.UP]: [u[5], u[6]],
        [Dir.RIGHT]: [rt[5], rt[6]],
        [Dir.LEFT]: [flip(rt[5]), flip(rt[6])],
      },
    };
  } else {
    // Fallback: return transparent placeholder sprites (16×32)
    const e = emptySprite(16, 32);
    const walkSet: [SpriteData, SpriteData, SpriteData, SpriteData] = [e, e, e, e];
    const pairSet: [SpriteData, SpriteData] = [e, e];
    sprites = {
      walk: {
        [Dir.DOWN]: walkSet,
        [Dir.UP]: walkSet,
        [Dir.RIGHT]: walkSet,
        [Dir.LEFT]: walkSet,
      },
      typing: {
        [Dir.DOWN]: pairSet,
        [Dir.UP]: pairSet,
        [Dir.RIGHT]: pairSet,
        [Dir.LEFT]: pairSet,
      },
      reading: {
        [Dir.DOWN]: pairSet,
        [Dir.UP]: pairSet,
        [Dir.RIGHT]: pairSet,
        [Dir.LEFT]: pairSet,
      },
    };
  }

  // Apply hue shift if non-zero
  if (hueShift !== 0) {
    sprites = hueShiftSprites(sprites, hueShift);
  }

  spriteCache.set(cacheKey, sprites);
  return sprites;
}
