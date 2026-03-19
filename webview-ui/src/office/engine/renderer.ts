import {
  BUBBLE_FADE_DURATION_SEC,
  BUBBLE_SITTING_OFFSET_PX,
  BUTTON_ICON_SIZE_FACTOR,
  BUTTON_LINE_WIDTH_MIN,
  BUTTON_LINE_WIDTH_ZOOM_FACTOR,
  BUTTON_MIN_RADIUS,
  BUTTON_RADIUS_ZOOM_FACTOR,
  CHARACTER_SITTING_OFFSET_PX,
  CHARACTER_SITTING_OFFSET_SIDE_PX,
  CHARACTER_Z_SORT_OFFSET,
  DELETE_BUTTON_BG,
  FALLBACK_FLOOR_COLOR,
  GHOST_BORDER_HOVER_FILL,
  GHOST_BORDER_HOVER_STROKE,
  GHOST_BORDER_STROKE,
  GHOST_INVALID_TINT,
  GHOST_PREVIEW_SPRITE_ALPHA,
  GHOST_PREVIEW_TINT_ALPHA,
  GHOST_VALID_TINT,
  GRID_LINE_COLOR,
  HOVERED_OUTLINE_ALPHA,
  NIGHT_OVERLAY_COLOR,
  NIGHT_OVERLAY_MAX_ALPHA,
  OUTLINE_Z_SORT_OFFSET,
  ROTATE_BUTTON_BG,
  SEAT_AVAILABLE_COLOR,
  SEAT_BUSY_COLOR,
  SEAT_OWN_COLOR,
  SELECTED_OUTLINE_ALPHA,
  SELECTION_DASH_PATTERN,
  SELECTION_HIGHLIGHT_COLOR,
  SUBAGENT_SCALE,
  SUNRISE_END_HOUR,
  SUNRISE_START_HOUR,
  SUNSET_END_HOUR,
  SUNSET_START_HOUR,
  TOOL_BUBBLE_BG_COLOR,
  TOOL_BUBBLE_BORDER_COLOR,
  TOOL_BUBBLE_FONT_SCALE,
  TOOL_BUBBLE_MAX_LABEL_LENGTH,
  TOOL_BUBBLE_MIN_FONT_SIZE,
  TOOL_BUBBLE_MIN_PADDING,
  TOOL_BUBBLE_PADDING_SCALE,
  TOOL_BUBBLE_TEXT_COLOR,
  TOOL_BUBBLE_VERTICAL_OFFSET,
  VOID_TILE_DASH_PATTERN,
  VOID_TILE_OUTLINE_COLOR,
} from '../../constants.js';
import { getColorizedFloorSprite, hasFloorSprites, WALL_COLOR } from '../floorTiles.js';
import { getCachedSprite, getOutlineSprite } from '../sprites/spriteCache.js';
import {
  BEER_BOTTLE_SPRITE,
  BUBBLE_ALERT_SPRITE,
  BUBBLE_CONFUSED_SPRITE,
  BUBBLE_HEART_SPRITE,
  BUBBLE_IDEA_SPRITE,
  BUBBLE_PERMISSION_SPRITE,
  BUBBLE_SLEEP_SPRITE,
  BUBBLE_SWEAT_SPRITE,
  BUBBLE_WAITING_SPRITE,
  COFFEE_MUG_SPRITE,
  FIRE_SPRITES,
  getCharacterSprites,
  LAPTOP_SPRITE,
  SODA_CAN_SPRITE,
} from '../sprites/spriteData.js';
import type {
  Character,
  FloorColor,
  FurnitureInstance,
  Seat,
  SpriteData,
  TileType as TileTypeVal,
} from '../types.js';
import { CharacterState, Direction, TILE_SIZE, TileType } from '../types.js';
import { getWallInstances, hasWallSprites, wallColorToHex } from '../wallTiles.js';
import { getCharacterSprite } from './characters.js';
import { renderMatrixEffect } from './matrixEffect.js';

// ── Render functions ────────────────────────────────────────────

export function renderTileGrid(
  ctx: CanvasRenderingContext2D,
  tileMap: TileTypeVal[][],
  offsetX: number,
  offsetY: number,
  zoom: number,
  tileColors?: Array<FloorColor | null>,
  cols?: number,
): void {
  const s = TILE_SIZE * zoom;
  const useSpriteFloors = hasFloorSprites();
  const tmRows = tileMap.length;
  const tmCols = tmRows > 0 ? tileMap[0].length : 0;
  const layoutCols = cols ?? tmCols;

  // Floor tiles + wall base color
  for (let r = 0; r < tmRows; r++) {
    for (let c = 0; c < tmCols; c++) {
      const tile = tileMap[r][c];

      // Skip VOID tiles entirely (transparent)
      if (tile === TileType.VOID) continue;

      if (tile === TileType.WALL || !useSpriteFloors) {
        // Wall tiles or fallback: solid color
        if (tile === TileType.WALL) {
          const colorIdx = r * layoutCols + c;
          const wallColor = tileColors?.[colorIdx];
          ctx.fillStyle = wallColor ? wallColorToHex(wallColor) : WALL_COLOR;
        } else {
          ctx.fillStyle = FALLBACK_FLOOR_COLOR;
        }
        ctx.fillRect(offsetX + c * s, offsetY + r * s, s, s);
        continue;
      }

      // Floor tile: get colorized sprite
      const colorIdx = r * layoutCols + c;
      const color = tileColors?.[colorIdx] ?? { h: 0, s: 0, b: 0, c: 0 };
      const sprite = getColorizedFloorSprite(tile, color);
      const cached = getCachedSprite(sprite, zoom);
      ctx.drawImage(cached, offsetX + c * s, offsetY + r * s);
    }
  }
}

interface ZDrawable {
  zY: number;
  draw: (ctx: CanvasRenderingContext2D) => void;
}

export function renderScene(
  ctx: CanvasRenderingContext2D,
  furniture: FurnitureInstance[],
  characters: Character[],
  offsetX: number,
  offsetY: number,
  zoom: number,
  selectedAgentId: number | null,
  hoveredAgentId: number | null,
): void {
  const drawables: ZDrawable[] = [];

  // Furniture
  for (const f of furniture) {
    const cached = getCachedSprite(f.sprite, zoom);
    const fx = offsetX + f.x * zoom;
    const fy = offsetY + f.y * zoom;

    // Glow effect for active electronics (behind the sprite)
    // Glow intensifies at night for atmospheric effect
    if (f.glowing) {
      const nightAlpha = getDayNightAlpha();
      const baseGlow = 0.15;
      const nightBoost = nightAlpha * 0.25; // stronger glow at night
      const glowStrength = baseGlow + nightBoost;
      const glowCx = fx + cached.width / 2;
      const glowCy = fy + cached.height * 0.4;
      const glowRadius = Math.max(cached.width, cached.height) * (0.7 + nightAlpha * 0.3);
      drawables.push({
        zY: f.zY - 0.01,
        draw: (c) => {
          c.save();
          const grad = c.createRadialGradient(glowCx, glowCy, 0, glowCx, glowCy, glowRadius);
          grad.addColorStop(0, `rgba(100, 180, 255, ${glowStrength})`);
          grad.addColorStop(0.5, `rgba(80, 150, 255, ${glowStrength * 0.4})`);
          grad.addColorStop(1, 'rgba(60, 120, 255, 0)');
          c.fillStyle = grad;
          c.fillRect(glowCx - glowRadius, glowCy - glowRadius, glowRadius * 2, glowRadius * 2);
          c.restore();
        },
      });
    }

    if (f.mirrored) {
      drawables.push({
        zY: f.zY,
        draw: (c) => {
          c.save();
          c.translate(fx + cached.width, fy);
          c.scale(-1, 1);
          c.drawImage(cached, 0, 0);
          c.restore();
        },
      });
    } else {
      drawables.push({
        zY: f.zY,
        draw: (c) => {
          c.drawImage(cached, fx, fy);
        },
      });
    }
  }

  // Characters
  for (const ch of characters) {
    const sprites = getCharacterSprites(ch.palette, ch.hueShift);
    const spriteData = getCharacterSprite(ch, sprites);
    // Sub-agents render at reduced scale
    const charZoom = ch.isSubagent ? zoom * SUBAGENT_SCALE : zoom;
    const cached = getCachedSprite(spriteData, charZoom);
    // Sitting offset: shift character down when seated so they visually sit in the chair
    // Side-facing agents (LEFT/RIGHT) use a smaller offset since the desk is beside them, not above
    const isSideFacing = ch.dir === Direction.LEFT || ch.dir === Direction.RIGHT;
    const sittingOffset =
      ch.state === CharacterState.TYPE
        ? isSideFacing
          ? CHARACTER_SITTING_OFFSET_SIDE_PX
          : CHARACTER_SITTING_OFFSET_PX
        : 0;
    // Anchor at bottom-center of character — round to integer device pixels
    const drawX = Math.round(offsetX + ch.x * zoom - cached.width / 2);
    const drawY = Math.round(offsetY + (ch.y + sittingOffset) * zoom - cached.height);

    // Sort characters by bottom of their tile (not center) so they render
    // in front of same-row furniture (e.g. chairs) but behind furniture
    // at lower rows (e.g. desks, bookshelves that occlude from below).
    const charZY = ch.y + TILE_SIZE / 2 + CHARACTER_Z_SORT_OFFSET;

    // Matrix spawn/despawn effect — skip outline, use per-pixel rendering
    if (ch.matrixEffect) {
      const mDrawX = drawX;
      const mDrawY = drawY;
      const mSpriteData = spriteData;
      const mCh = ch;
      const mCharZoom = charZoom;
      drawables.push({
        zY: charZY,
        draw: (c) => {
          renderMatrixEffect(c, mCh, mSpriteData, mDrawX, mDrawY, mCharZoom);
        },
      });
      continue;
    }

    // White outline: full opacity for selected, 50% for hover
    const isSelected = selectedAgentId !== null && ch.id === selectedAgentId;
    const isHovered = hoveredAgentId !== null && ch.id === hoveredAgentId;
    if (isSelected || isHovered) {
      const outlineAlpha = isSelected ? SELECTED_OUTLINE_ALPHA : HOVERED_OUTLINE_ALPHA;
      const outlineData = getOutlineSprite(spriteData);
      const outlineCached = getCachedSprite(outlineData, charZoom);
      const olDrawX = drawX - charZoom; // 1 sprite-pixel offset, scaled
      const olDrawY = drawY - charZoom; // outline follows sitting offset via drawY
      drawables.push({
        zY: charZY - OUTLINE_Z_SORT_OFFSET, // sort just before character
        draw: (c) => {
          c.save();
          c.globalAlpha = outlineAlpha;
          c.drawImage(outlineCached, olDrawX, olDrawY);
          c.restore();
        },
      });
    }

    drawables.push({
      zY: charZY,
      draw: (c) => {
        c.drawImage(cached, drawX, drawY);
      },
    });

    // Laptop sprite for sub-agents — on their lap when seated
    if (ch.hasLaptop) {
      const laptopCached = getCachedSprite(LAPTOP_SPRITE, charZoom);
      const laptopX = Math.round(offsetX + ch.x * zoom - laptopCached.width / 2);
      // Position at the character's midsection (8px above bottom)
      const lapOffset = ch.state === CharacterState.TYPE ? Math.round(-charZoom * 8) : 0;
      const laptopY = Math.round(
        offsetY + (ch.y + sittingOffset) * zoom - laptopCached.height + lapOffset,
      );
      drawables.push({
        zY: charZY + 0.5, // render well in front of character
        draw: (c) => {
          c.drawImage(laptopCached, laptopX, laptopY);
        },
      });
    }

    // Time-based desk drink — coffee (morning), soda (afternoon), beer (evening)
    // Only show for non-sub-agents that are seated at a desk
    if (!ch.isSubagent && ch.seatId && ch.state === CharacterState.TYPE) {
      const hour = new Date().getHours();
      let drinkSprite: SpriteData | null = null;
      if (hour >= 5 && hour < 12) drinkSprite = COFFEE_MUG_SPRITE;
      else if (hour >= 12 && hour < 18) drinkSprite = SODA_CAN_SPRITE;
      else drinkSprite = BEER_BOTTLE_SPRITE;

      if (drinkSprite) {
        const drinkZoom = Math.max(1, Math.round(zoom * 0.6));
        const drinkCached = getCachedSprite(drinkSprite, drinkZoom);
        // Place drink on the desk surface — offset to the right of center
        const drinkX = Math.round(offsetX + (ch.x + 6) * zoom - drinkCached.width / 2);
        // Position at desk level (above the character, on the desk surface)
        const drinkY = Math.round(offsetY + (ch.y - TILE_SIZE + 4) * zoom);
        drawables.push({
          zY: ch.y - TILE_SIZE + 0.1, // on the desk, behind the character
          draw: (c) => {
            c.drawImage(drinkCached, drinkX, drinkY);
          },
        });
      }
    }
  }

  // Sort by Y (lower = in front = drawn later)
  drawables.sort((a, b) => a.zY - b.zY);

  for (const d of drawables) {
    d.draw(ctx);
  }
}

// ── Seat indicators ─────────────────────────────────────────────

export function renderSeatIndicators(
  ctx: CanvasRenderingContext2D,
  seats: Map<string, Seat>,
  characters: Map<number, Character>,
  selectedAgentId: number | null,
  hoveredTile: { col: number; row: number } | null,
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  if (selectedAgentId === null || !hoveredTile) return;
  const selectedChar = characters.get(selectedAgentId);
  if (!selectedChar) return;

  // Only show indicator for the hovered seat tile
  for (const [uid, seat] of seats) {
    if (seat.seatCol !== hoveredTile.col || seat.seatRow !== hoveredTile.row) continue;

    const s = TILE_SIZE * zoom;
    const x = offsetX + seat.seatCol * s;
    const y = offsetY + seat.seatRow * s;

    if (selectedChar.seatId === uid) {
      // Selected agent's own seat — blue
      ctx.fillStyle = SEAT_OWN_COLOR;
    } else if (!seat.assigned) {
      // Available seat — green
      ctx.fillStyle = SEAT_AVAILABLE_COLOR;
    } else {
      // Busy (assigned to another agent) — red
      ctx.fillStyle = SEAT_BUSY_COLOR;
    }
    ctx.fillRect(x, y, s, s);
    break;
  }
}

// ── Edit mode overlays ──────────────────────────────────────────

export function renderGridOverlay(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  zoom: number,
  cols: number,
  rows: number,
  tileMap?: TileTypeVal[][],
): void {
  const s = TILE_SIZE * zoom;
  ctx.strokeStyle = GRID_LINE_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  // Vertical lines — offset by 0.5 for crisp 1px lines
  for (let c = 0; c <= cols; c++) {
    const x = offsetX + c * s + 0.5;
    ctx.moveTo(x, offsetY);
    ctx.lineTo(x, offsetY + rows * s);
  }
  // Horizontal lines
  for (let r = 0; r <= rows; r++) {
    const y = offsetY + r * s + 0.5;
    ctx.moveTo(offsetX, y);
    ctx.lineTo(offsetX + cols * s, y);
  }
  ctx.stroke();

  // Draw faint dashed outlines on VOID tiles
  if (tileMap) {
    ctx.save();
    ctx.strokeStyle = VOID_TILE_OUTLINE_COLOR;
    ctx.lineWidth = 1;
    ctx.setLineDash(VOID_TILE_DASH_PATTERN);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (tileMap[r]?.[c] === TileType.VOID) {
          ctx.strokeRect(offsetX + c * s + 0.5, offsetY + r * s + 0.5, s - 1, s - 1);
        }
      }
    }
    ctx.restore();
  }
}

/** Draw faint expansion placeholders 1 tile outside grid bounds (ghost border). */
export function renderGhostBorder(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  zoom: number,
  cols: number,
  rows: number,
  ghostHoverCol: number,
  ghostHoverRow: number,
): void {
  const s = TILE_SIZE * zoom;
  ctx.save();

  // Collect ghost border tiles: one ring around the grid
  const ghostTiles: Array<{ c: number; r: number }> = [];
  // Top and bottom rows
  for (let c = -1; c <= cols; c++) {
    ghostTiles.push({ c, r: -1 });
    ghostTiles.push({ c, r: rows });
  }
  // Left and right columns (excluding corners already added)
  for (let r = 0; r < rows; r++) {
    ghostTiles.push({ c: -1, r });
    ghostTiles.push({ c: cols, r });
  }

  for (const { c, r } of ghostTiles) {
    const x = offsetX + c * s;
    const y = offsetY + r * s;
    const isHovered = c === ghostHoverCol && r === ghostHoverRow;
    if (isHovered) {
      ctx.fillStyle = GHOST_BORDER_HOVER_FILL;
      ctx.fillRect(x, y, s, s);
    }
    ctx.strokeStyle = isHovered ? GHOST_BORDER_HOVER_STROKE : GHOST_BORDER_STROKE;
    ctx.lineWidth = 1;
    ctx.setLineDash(VOID_TILE_DASH_PATTERN);
    ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
  }

  ctx.restore();
}

export function renderGhostPreview(
  ctx: CanvasRenderingContext2D,
  sprite: SpriteData,
  col: number,
  row: number,
  valid: boolean,
  offsetX: number,
  offsetY: number,
  zoom: number,
  mirrored: boolean = false,
): void {
  const cached = getCachedSprite(sprite, zoom);
  const x = offsetX + col * TILE_SIZE * zoom;
  const y = offsetY + row * TILE_SIZE * zoom;
  ctx.save();
  ctx.globalAlpha = GHOST_PREVIEW_SPRITE_ALPHA;
  if (mirrored) {
    ctx.translate(x + cached.width, y);
    ctx.scale(-1, 1);
    ctx.drawImage(cached, 0, 0);
  } else {
    ctx.drawImage(cached, x, y);
  }
  // Tint overlay — reset transform for correct fill position
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = GHOST_PREVIEW_TINT_ALPHA;
  ctx.fillStyle = valid ? GHOST_VALID_TINT : GHOST_INVALID_TINT;
  ctx.fillRect(x, y, cached.width, cached.height);
  ctx.restore();
}

export function renderSelectionHighlight(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  w: number,
  h: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  const s = TILE_SIZE * zoom;
  const x = offsetX + col * s;
  const y = offsetY + row * s;
  ctx.save();
  ctx.strokeStyle = SELECTION_HIGHLIGHT_COLOR;
  ctx.lineWidth = 2;
  ctx.setLineDash(SELECTION_DASH_PATTERN);
  ctx.strokeRect(x + 1, y + 1, w * s - 2, h * s - 2);
  ctx.restore();
}

export function renderDeleteButton(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  w: number,
  _h: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
): DeleteButtonBounds {
  const s = TILE_SIZE * zoom;
  // Position at top-right corner of selected furniture
  const cx = offsetX + (col + w) * s + 1;
  const cy = offsetY + row * s - 1;
  const radius = Math.max(BUTTON_MIN_RADIUS, zoom * BUTTON_RADIUS_ZOOM_FACTOR);

  // Circle background
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = DELETE_BUTTON_BG;
  ctx.fill();

  // X mark
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(BUTTON_LINE_WIDTH_MIN, zoom * BUTTON_LINE_WIDTH_ZOOM_FACTOR);
  ctx.lineCap = 'round';
  const xSize = radius * BUTTON_ICON_SIZE_FACTOR;
  ctx.beginPath();
  ctx.moveTo(cx - xSize, cy - xSize);
  ctx.lineTo(cx + xSize, cy + xSize);
  ctx.moveTo(cx + xSize, cy - xSize);
  ctx.lineTo(cx - xSize, cy + xSize);
  ctx.stroke();
  ctx.restore();

  return { cx, cy, radius };
}

export function renderRotateButton(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  _w: number,
  _h: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
): RotateButtonBounds {
  const s = TILE_SIZE * zoom;
  // Position to the left of the delete button (which is at top-right corner)
  const radius = Math.max(BUTTON_MIN_RADIUS, zoom * BUTTON_RADIUS_ZOOM_FACTOR);
  const cx = offsetX + col * s - 1;
  const cy = offsetY + row * s - 1;

  // Circle background
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = ROTATE_BUTTON_BG;
  ctx.fill();

  // Circular arrow icon
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(BUTTON_LINE_WIDTH_MIN, zoom * BUTTON_LINE_WIDTH_ZOOM_FACTOR);
  ctx.lineCap = 'round';
  const arcR = radius * BUTTON_ICON_SIZE_FACTOR;
  ctx.beginPath();
  // Draw a 270-degree arc
  ctx.arc(cx, cy, arcR, -Math.PI * 0.8, Math.PI * 0.7);
  ctx.stroke();
  // Draw arrowhead at the end of the arc
  const endAngle = Math.PI * 0.7;
  const endX = cx + arcR * Math.cos(endAngle);
  const endY = cy + arcR * Math.sin(endAngle);
  const arrowSize = radius * 0.35;
  ctx.beginPath();
  ctx.moveTo(endX + arrowSize * 0.6, endY - arrowSize * 0.3);
  ctx.lineTo(endX, endY);
  ctx.lineTo(endX + arrowSize * 0.7, endY + arrowSize * 0.5);
  ctx.stroke();
  ctx.restore();

  return { cx, cy, radius };
}

// ── Speech bubbles ──────────────────────────────────────────────

export function renderBubbles(
  ctx: CanvasRenderingContext2D,
  characters: Character[],
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  for (const ch of characters) {
    if (!ch.bubbleType) continue;

    let sprite: SpriteData;
    switch (ch.bubbleType) {
      case 'permission':
        sprite = BUBBLE_PERMISSION_SPRITE;
        break;
      case 'waiting':
        sprite = BUBBLE_WAITING_SPRITE;
        break;
      case 'sleep':
        sprite = BUBBLE_SLEEP_SPRITE;
        break;
      case 'alert':
        sprite = BUBBLE_ALERT_SPRITE;
        break;
      case 'confused':
        sprite = BUBBLE_CONFUSED_SPRITE;
        break;
      case 'sweat':
        sprite = BUBBLE_SWEAT_SPRITE;
        break;
      case 'idea':
        sprite = BUBBLE_IDEA_SPRITE;
        break;
      case 'heart':
        sprite = BUBBLE_HEART_SPRITE;
        break;
      default:
        continue;
    }

    // Compute opacity: permission/sleep = full, timed bubbles fade out
    let alpha = 1.0;
    if (
      ch.bubbleType !== 'permission' &&
      ch.bubbleType !== 'sleep' &&
      ch.bubbleTimer < BUBBLE_FADE_DURATION_SEC
    ) {
      alpha = ch.bubbleTimer / BUBBLE_FADE_DURATION_SEC;
    }

    const bubbleZoom = ch.isSubagent ? zoom * SUBAGENT_SCALE : zoom;
    const cached = getCachedSprite(sprite, bubbleZoom);
    // Position: centered above the character's head
    // Character is anchored bottom-center at (ch.x, ch.y), sprite is 16x24
    // Place bubble above head with a small gap; follow sitting offset
    const sittingOff = ch.state === CharacterState.TYPE ? BUBBLE_SITTING_OFFSET_PX : 0;
    const charSpriteHeight = ch.isSubagent ? 24 * zoom * SUBAGENT_SCALE : 24 * zoom;
    const bubbleX = Math.round(offsetX + ch.x * zoom - cached.width / 2);
    const bubbleY = Math.round(
      offsetY + (ch.y + sittingOff) * zoom - charSpriteHeight - cached.height - 1 * bubbleZoom,
    );

    ctx.save();
    if (alpha < 1.0) ctx.globalAlpha = alpha;
    ctx.drawImage(cached, bubbleX, bubbleY);
    ctx.restore();
  }
}

// ── Tool thought bubbles ─────────────────────────────────────────

export function renderToolBubbles(
  ctx: CanvasRenderingContext2D,
  characters: Character[],
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  const fontSize = Math.max(TOOL_BUBBLE_MIN_FONT_SIZE, Math.round(zoom * TOOL_BUBBLE_FONT_SCALE));
  ctx.font = `${fontSize}px "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';

  for (const ch of characters) {
    if (!ch.currentTool || !ch.isActive || ch.matrixEffect) continue;

    // Skip if a permission/waiting bubble is already showing
    if (ch.bubbleType) continue;

    // Truncate tool name
    const label =
      ch.currentTool.length > TOOL_BUBBLE_MAX_LABEL_LENGTH
        ? ch.currentTool.slice(0, TOOL_BUBBLE_MAX_LABEL_LENGTH)
        : ch.currentTool;

    const padding = Math.max(TOOL_BUBBLE_MIN_PADDING, Math.round(zoom * TOOL_BUBBLE_PADDING_SCALE));
    const textWidth = ctx.measureText(label).width;
    const bgWidth = textWidth + padding * 2;
    const bgHeight = fontSize + padding * 2;

    // Position above character head (above any existing sprite bubbles)
    const sittingOffset = ch.state === CharacterState.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0;
    const centerX = Math.round(offsetX + ch.x * zoom);
    const bottomY = Math.round(
      offsetY + (ch.y + sittingOffset) * zoom - zoom * TOOL_BUBBLE_VERTICAL_OFFSET,
    );

    // Background
    ctx.fillStyle = TOOL_BUBBLE_BG_COLOR;
    ctx.fillRect(
      Math.round(centerX - bgWidth / 2),
      Math.round(bottomY - bgHeight),
      bgWidth,
      bgHeight,
    );

    // Border
    ctx.strokeStyle = TOOL_BUBBLE_BORDER_COLOR;
    ctx.lineWidth = 1;
    ctx.strokeRect(
      Math.round(centerX - bgWidth / 2),
      Math.round(bottomY - bgHeight),
      bgWidth,
      bgHeight,
    );

    // Text
    ctx.fillStyle = TOOL_BUBBLE_TEXT_COLOR;
    ctx.fillText(label, centerX, bottomY - padding);
  }
}

// ── Character labels ─────────────────────────────────────────────

/** Extract the last segment of a path (e.g., "/Users/foo/tesla" → "tesla") */
function lastPathSegment(p: string): string {
  const segments = p.split('/').filter(Boolean);
  return segments[segments.length - 1] || p;
}

/** Status dot color based on character activity */
function getStatusDot(ch: Character): { dot: string; color: string } {
  if (ch.isActive && (ch.state === CharacterState.TYPE || ch.currentTool)) {
    return { dot: '\u25CF ', color: '#4ade80' }; // green — actively working
  }
  if (ch.isActive) {
    return { dot: '\u25CF ', color: '#facc15' }; // yellow — active but waiting
  }
  return { dot: '\u25CF ', color: '#9ca3af' }; // grey — idle
}

export function renderCharacterLabels(
  ctx: CanvasRenderingContext2D,
  characters: Character[],
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  // First pass: compute label positions
  const labels: Array<{
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
    dotColor: string;
  }> = [];
  const fontSize = Math.max(5, Math.round(6 * zoom));
  ctx.save();
  ctx.font = `${fontSize}px "Courier New", Courier, monospace`;

  for (const ch of characters) {
    // Sub-agents don't get their own label (parent's label is sufficient)
    if (ch.isSubagent) continue;
    const rawLabel = ch.projectPath ? lastPathSegment(ch.projectPath) : ch.folderName;
    if (!rawLabel || ch.matrixEffect) continue;

    const { dot, color: dotColor } = getStatusDot(ch);
    const label = dot + rawLabel;

    const sittingOffset = ch.state === CharacterState.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0;
    const isActiveAgent = ch.isActive || ch.state === CharacterState.TYPE;
    const labelX = Math.round(offsetX + ch.x * zoom);
    // Active agents: position label ABOVE the character's head
    // Idle agents: position label below the character
    const charSpriteHeight = 24 * zoom;
    let labelY: number;
    if (isActiveAgent) {
      // Above: character anchored bottom-center, sprite is 24px tall
      const headY = offsetY + (ch.y + sittingOffset) * zoom - charSpriteHeight;
      labelY = Math.round(headY - fontSize - 4 * zoom);
    } else {
      labelY = Math.round(offsetY + (ch.y + sittingOffset) * zoom + 2 * zoom);
    }
    const metrics = ctx.measureText(label);
    const labelW = metrics.width;
    const labelH = fontSize + 2;

    // Nudge down if overlapping with an existing label
    for (const prev of labels) {
      const overlapX = Math.abs(labelX - prev.x) < (labelW + prev.width) / 2;
      const overlapY = Math.abs(labelY - prev.y) < labelH;
      if (overlapX && overlapY) {
        labelY = prev.y + labelH;
      }
    }

    labels.push({ label, x: labelX, y: labelY, width: labelW, height: labelH, dotColor });
  }
  ctx.restore();

  // Second pass: render
  for (const { label, x, y, dotColor } of labels) {
    ctx.save();
    ctx.font = `${fontSize}px "Courier New", Courier, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.globalAlpha = 0.7;

    // Thin dark shadow for readability
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillText(label, x + 1, y + 1);

    // Draw the dot in color, then the rest in white
    const dotStr = label.substring(0, 2); // "● "
    const textStr = label.substring(2);
    const dotWidth = ctx.measureText(dotStr).width;
    const fullWidth = ctx.measureText(label).width;
    const startX = x - fullWidth / 2;

    ctx.textAlign = 'left';
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = dotColor;
    ctx.fillText(dotStr, startX, y);

    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#e0e0e0';
    ctx.fillText(textStr, startX + dotWidth, y);

    ctx.restore();
  }
}

export interface ButtonBounds {
  /** Center X in device pixels */
  cx: number;
  /** Center Y in device pixels */
  cy: number;
  /** Radius in device pixels */
  radius: number;
}

export type DeleteButtonBounds = ButtonBounds;
export type RotateButtonBounds = ButtonBounds;

// ── Whiteboard todos ─────────────────────────────────────────────

function renderWhiteboardTodos(
  ctx: CanvasRenderingContext2D,
  whiteboards: Array<{ col: number; row: number; width: number; height: number }>,
  todos: Array<{ status: string }>,
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  if (todos.length === 0 || whiteboards.length === 0) return;
  const wb = whiteboards[0];
  const blockSize = Math.max(2, Math.round(3 * zoom));
  const padding = Math.round(3 * zoom);
  const startX = Math.round(offsetX + wb.col * TILE_SIZE * zoom) + padding;
  const startY = Math.round(offsetY + wb.row * TILE_SIZE * zoom) + padding;
  const maxCols = Math.floor((wb.width * TILE_SIZE * zoom - padding * 2) / (blockSize + 1));
  if (maxCols <= 0) return;

  // Cap completed items at 6 most recent
  const MAX_DONE = 6;
  const completed = todos.filter((t) => t.status === 'completed');
  const nonCompleted = todos.filter((t) => t.status !== 'completed');
  const capped = [...nonCompleted, ...completed.slice(-MAX_DONE)];

  ctx.save();
  let c = 0,
    r = 0;
  for (const todo of capped) {
    ctx.fillStyle =
      todo.status === 'completed'
        ? '#a6e3a1'
        : todo.status === 'in_progress'
          ? '#f9e2af'
          : '#585b70';
    ctx.fillRect(startX + c * (blockSize + 1), startY + r * (blockSize + 1), blockSize, blockSize);
    c++;
    if (c >= maxCols) {
      c = 0;
      r++;
    }
  }
  ctx.restore();
}

// ── Day/Night Cycle ─────────────────────────────────────────────

/** Compute the overlay alpha for the day/night cycle based on the current system time. */
function getDayNightAlpha(): number {
  const hour = new Date().getHours() + new Date().getMinutes() / 60;

  if (hour >= SUNRISE_START_HOUR && hour < SUNRISE_END_HOUR) {
    // Sunrise: gradually lighten from max alpha to 0
    const t = (hour - SUNRISE_START_HOUR) / (SUNRISE_END_HOUR - SUNRISE_START_HOUR);
    return NIGHT_OVERLAY_MAX_ALPHA * (1 - t);
  }
  if (hour >= SUNRISE_END_HOUR && hour < SUNSET_START_HOUR) {
    // Daytime: no overlay
    return 0;
  }
  if (hour >= SUNSET_START_HOUR && hour < SUNSET_END_HOUR) {
    // Sunset: gradually darken from 0 to max alpha
    const t = (hour - SUNSET_START_HOUR) / (SUNSET_END_HOUR - SUNSET_START_HOUR);
    return NIGHT_OVERLAY_MAX_ALPHA * t;
  }
  // Night: full overlay
  return NIGHT_OVERLAY_MAX_ALPHA;
}

export function renderDayNightOverlay(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const alpha = getDayNightAlpha();
  if (alpha <= 0) return;
  ctx.save();
  ctx.fillStyle = NIGHT_OVERLAY_COLOR + ' ' + alpha.toFixed(4) + ')';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.restore();
}

export interface EditorRenderState {
  showGrid: boolean;
  ghostSprite: SpriteData | null;
  ghostMirrored: boolean;
  ghostCol: number;
  ghostRow: number;
  ghostValid: boolean;
  selectedCol: number;
  selectedRow: number;
  selectedW: number;
  selectedH: number;
  hasSelection: boolean;
  isRotatable: boolean;
  /** Updated each frame by renderDeleteButton */
  deleteButtonBounds: DeleteButtonBounds | null;
  /** Updated each frame by renderRotateButton */
  rotateButtonBounds: RotateButtonBounds | null;
  /** Whether to show ghost border (expansion tiles outside grid) */
  showGhostBorder: boolean;
  /** Hovered ghost border tile col (-1 to cols) */
  ghostBorderHoverCol: number;
  /** Hovered ghost border tile row (-1 to rows) */
  ghostBorderHoverRow: number;
}

export interface SelectionRenderState {
  selectedAgentId: number | null;
  hoveredAgentId: number | null;
  hoveredTile: { col: number; row: number } | null;
  seats: Map<string, Seat>;
  characters: Map<number, Character>;
}

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  tileMap: TileTypeVal[][],
  furniture: FurnitureInstance[],
  characters: Character[],
  zoom: number,
  panX: number,
  panY: number,
  selection?: SelectionRenderState,
  editor?: EditorRenderState,
  tileColors?: Array<FloorColor | null>,
  layoutCols?: number,
  layoutRows?: number,
  _deskLabels?: Array<{ col: number; row: number; label: string }>,
  whiteboards?: Array<{ col: number; row: number; width: number; height: number }>,
  todos?: Array<{ status: string }>,
  debugSeats?: Map<string, Seat>,
  clockPositions?: Array<{ col: number; row: number }>,
  branchRooms?: Array<{
    branch: string;
    roomCol: number;
    roomRow: number;
    width: number;
    height: number;
    ciStatus?: string;
  }>,
): { offsetX: number; offsetY: number } {
  // Clear
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // Use layout dimensions (fallback to tileMap size)
  const cols = layoutCols ?? (tileMap.length > 0 ? tileMap[0].length : 0);
  const rows = layoutRows ?? tileMap.length;

  // Center map in viewport + pan offset (integer device pixels)
  const mapW = cols * TILE_SIZE * zoom;
  const mapH = rows * TILE_SIZE * zoom;
  const offsetX = Math.floor((canvasWidth - mapW) / 2) + Math.round(panX);
  const offsetY = Math.floor((canvasHeight - mapH) / 2) + Math.round(panY);

  // Draw tiles (floor + wall base color)
  renderTileGrid(ctx, tileMap, offsetX, offsetY, zoom, tileColors, layoutCols);

  // Seat indicators (below furniture/characters, on top of floor)
  if (selection) {
    renderSeatIndicators(
      ctx,
      selection.seats,
      selection.characters,
      selection.selectedAgentId,
      selection.hoveredTile,
      offsetX,
      offsetY,
      zoom,
    );
  }

  // Build wall instances for z-sorting with furniture and characters
  const wallInstances = hasWallSprites() ? getWallInstances(tileMap, tileColors, layoutCols) : [];
  const allFurniture = wallInstances.length > 0 ? [...wallInstances, ...furniture] : furniture;

  // Draw walls + furniture + characters (z-sorted)
  const selectedId = selection?.selectedAgentId ?? null;
  const hoveredId = selection?.hoveredAgentId ?? null;
  renderScene(ctx, allFurniture, characters, offsetX, offsetY, zoom, selectedId, hoveredId);

  // Debug: draw seat positions and character positions
  if (debugSeats && debugSeats.size > 0) {
    ctx.save();
    const s = TILE_SIZE * zoom;
    // Draw all seats as colored squares
    for (const [uid, seat] of debugSeats) {
      const x = offsetX + seat.seatCol * s;
      const y = offsetY + seat.seatRow * s;
      // Green = unassigned, blue = assigned
      ctx.fillStyle = seat.assigned ? 'rgba(60, 120, 255, 0.4)' : 'rgba(60, 255, 120, 0.4)';
      ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
      // Draw facing direction arrow
      const cx = x + s / 2;
      const cy = y + s / 2;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.max(1, zoom * 0.5);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      const arrowLen = s * 0.4;
      const dx = seat.facingDir === 3 ? arrowLen : seat.facingDir === 2 ? -arrowLen : 0;
      const dy = seat.facingDir === 1 ? arrowLen : seat.facingDir === 0 ? -arrowLen : 0;
      ctx.lineTo(cx + dx, cy + dy);
      ctx.stroke();
      // Label
      const fontSize = Math.max(4, Math.round(3 * zoom));
      ctx.font = `${fontSize}px monospace`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(uid.slice(-4), cx, y + s - 2);
    }
    // Draw character positions as red dots
    for (const ch of characters) {
      const cx = offsetX + ch.x * zoom;
      const cy = offsetY + ch.y * zoom;
      ctx.fillStyle = 'rgba(255, 60, 60, 0.8)';
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(2, zoom), 0, Math.PI * 2);
      ctx.fill();
      // Show seat assignment
      if (ch.seatId) {
        const seat = debugSeats.get(ch.seatId);
        if (seat) {
          ctx.strokeStyle = 'rgba(255, 255, 0, 0.6)';
          ctx.lineWidth = 1;
          ctx.setLineDash([zoom, zoom]);
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(offsetX + (seat.seatCol + 0.5) * s, offsetY + (seat.seatRow + 0.5) * s);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }
    ctx.restore();
  }

  // Desk labels disabled — folder names on desk surfaces were too noisy
  // if (deskLabels && deskLabels.length > 0) {
  //   renderDeskLabels(ctx, deskLabels, offsetX, offsetY, zoom);
  // }

  // Whiteboard todo blocks
  if (whiteboards && todos) {
    renderWhiteboardTodos(ctx, whiteboards, todos, offsetX, offsetY, zoom);
  }

  // Real-time clock hands
  if (clockPositions && clockPositions.length > 0) {
    const now = new Date();
    const hours = now.getHours() % 12;
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const hourAngle = ((hours + minutes / 60) / 12) * Math.PI * 2 - Math.PI / 2;
    const minuteAngle = ((minutes + seconds / 60) / 60) * Math.PI * 2 - Math.PI / 2;

    ctx.save();
    for (const clock of clockPositions) {
      // Clock face center — sprite is 16x32, face center at pixel (8, 16) in sprite coords
      const cx = Math.round(offsetX + (clock.col * TILE_SIZE + 8) * zoom);
      const cy = Math.round(offsetY + (clock.row * TILE_SIZE + 16) * zoom);
      const radius = Math.round(4 * zoom);

      // Hour hand (shorter, thicker)
      ctx.strokeStyle = '#222233';
      ctx.lineWidth = Math.max(1, Math.round(zoom * 0.7));
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(
        cx + Math.cos(hourAngle) * radius * 0.55,
        cy + Math.sin(hourAngle) * radius * 0.55,
      );
      ctx.stroke();

      // Minute hand (longer, thinner)
      ctx.lineWidth = Math.max(1, Math.round(zoom * 0.5));
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(
        cx + Math.cos(minuteAngle) * radius * 0.85,
        cy + Math.sin(minuteAngle) * radius * 0.85,
      );
      ctx.stroke();

      // Center dot
      ctx.fillStyle = '#333344';
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1, zoom * 0.3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Branch room labels + CI fire effects
  if (branchRooms && branchRooms.length > 0) {
    ctx.save();
    const fireFrame = Math.floor(Date.now() / 200) % 2;
    const fireSprite = FIRE_SPRITES[fireFrame];
    for (const room of branchRooms) {
      // Branch name label at top of room
      const labelX = Math.round(offsetX + (room.roomCol + room.width / 2) * TILE_SIZE * zoom);
      const labelY = Math.round(offsetY + (room.roomRow + 0.3) * TILE_SIZE * zoom);
      const fontSize = Math.max(6, Math.round(zoom * 4));
      ctx.font = `bold ${fontSize}px "Courier New", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      // Background
      const label = room.branch.length > 15 ? room.branch.slice(0, 15) + '...' : room.branch;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(labelX - tw / 2 - 4, labelY - 2, tw + 8, fontSize + 4);
      // Text color based on CI status
      ctx.fillStyle =
        room.ciStatus === 'fail'
          ? '#ff4444'
          : room.ciStatus === 'pass'
            ? '#44ff44'
            : room.ciStatus === 'pending'
              ? '#ffcc44'
              : '#cdd6f4';
      ctx.fillText(label, labelX, labelY);

      // Fire effect on CI failure — render on the server rack area
      if (room.ciStatus === 'fail') {
        const fireCached = getCachedSprite(fireSprite, zoom);
        const fireX = Math.round(offsetX + (room.roomCol + room.width - 2) * TILE_SIZE * zoom);
        const fireY = Math.round(
          offsetY + (room.roomRow + 1) * TILE_SIZE * zoom - fireCached.height,
        );
        ctx.drawImage(fireCached, fireX, fireY);
        // Second fire on the desk
        const fireX2 = Math.round(offsetX + (room.roomCol + 2) * TILE_SIZE * zoom);
        ctx.drawImage(fireCached, fireX2, fireY);
      }
    }
    ctx.restore();
  }

  // Speech bubbles (always on top of characters)
  renderBubbles(ctx, characters, offsetX, offsetY, zoom);

  // Tool thought bubbles (text-based, shown when no speech bubble is active)
  renderToolBubbles(ctx, characters, offsetX, offsetY, zoom);

  // Hover tooltip disabled — ToolOverlay (React) shows the same info more cleanly
  // if (hoveredId !== null) {
  //   const hoveredCh = characters.find((c) => c.id === hoveredId);
  //   if (hoveredCh && !hoveredCh.matrixEffect) {
  //     renderTooltip(ctx, hoveredCh, offsetX, offsetY, zoom);
  //   }
  // }

  // Project path labels below characters
  // Labels disabled — agents are identified by their consistent character appearance
  // renderCharacterLabels(ctx, characters, offsetX, offsetY, zoom);

  // Editor overlays
  if (editor) {
    if (editor.showGrid) {
      renderGridOverlay(ctx, offsetX, offsetY, zoom, cols, rows, tileMap);
    }
    if (editor.showGhostBorder) {
      renderGhostBorder(
        ctx,
        offsetX,
        offsetY,
        zoom,
        cols,
        rows,
        editor.ghostBorderHoverCol,
        editor.ghostBorderHoverRow,
      );
    }
    if (editor.ghostSprite && editor.ghostCol >= 0) {
      renderGhostPreview(
        ctx,
        editor.ghostSprite,
        editor.ghostCol,
        editor.ghostRow,
        editor.ghostValid,
        offsetX,
        offsetY,
        zoom,
        editor.ghostMirrored,
      );
    }
    if (editor.hasSelection) {
      renderSelectionHighlight(
        ctx,
        editor.selectedCol,
        editor.selectedRow,
        editor.selectedW,
        editor.selectedH,
        offsetX,
        offsetY,
        zoom,
      );
      editor.deleteButtonBounds = renderDeleteButton(
        ctx,
        editor.selectedCol,
        editor.selectedRow,
        editor.selectedW,
        editor.selectedH,
        offsetX,
        offsetY,
        zoom,
      );
      if (editor.isRotatable) {
        editor.rotateButtonBounds = renderRotateButton(
          ctx,
          editor.selectedCol,
          editor.selectedRow,
          editor.selectedW,
          editor.selectedH,
          offsetX,
          offsetY,
          zoom,
        );
      } else {
        editor.rotateButtonBounds = null;
      }
    } else {
      editor.deleteButtonBounds = null;
      editor.rotateButtonBounds = null;
    }
  }

  // Day/night cycle overlay — tints the entire canvas after all scene rendering
  renderDayNightOverlay(ctx, canvasWidth, canvasHeight);

  return { offsetX, offsetY };
}
