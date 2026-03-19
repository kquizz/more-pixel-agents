import {
  ALL_IDLE_FUN_COOLDOWN_SEC,
  ALL_IDLE_THRESHOLD_SEC,
  AMBIENT_ANIM_INTERVAL_SEC,
  AMENITY_FURNITURE_TYPES,
  AMENITY_VISIT_CHANCE,
  AUTO_ON_FACING_DEPTH,
  AUTO_ON_SIDE_DEPTH,
  CELEBRATION_CHANCE,
  CHARACTER_HIT_HALF_WIDTH,
  CHARACTER_HIT_HEIGHT,
  CHARACTER_SITTING_OFFSET_PX,
  DESK_VISIT_CHANCE,
  DISMISS_BUBBLE_FAST_FADE_SEC,
  FURNITURE_ANIM_INTERVAL_SEC,
  GREETING_DURATION_SEC,
  GREETING_PARENT_EXTRA_SEC,
  HANDOFF_VISIT_USE_SEC,
  HUE_SHIFT_MIN_DEG,
  HUE_SHIFT_RANGE_DEG,
  INACTIVE_SEAT_TIMER_MIN_SEC,
  INACTIVE_SEAT_TIMER_RANGE_SEC,
  LONG_TURN_THRESHOLD_SEC,
  MAX_SUBAGENTS_PER_PARENT,
  PALETTE_COUNT,
  PERMISSION_IMPATIENT_SEC,
  PERMISSION_SWEAT_INTERVAL_SEC,
  PRINTER_BEATDOWN_CHANCE,
  REACTION_BUBBLE_DURATION_SEC,
  RUBBER_DUCK_CHANCE,
  RUBBER_DUCK_STARE_SEC,
  SCREEN_SHAKE_DURATION_SEC,
  SCREEN_SHAKE_INTENSITY,
  SLEEP_IDLE_THRESHOLD_SEC,
  SUBAGENT_SCALE,
  WAITING_BUBBLE_DURATION_SEC,
  WHITEBOARD_ARGUMENT_CHANCE,
} from '../../constants.js';
import { getAnimationFrames, getCatalogEntry, getOnStateType } from '../layout/furnitureCatalog.js';
import {
  createDefaultLayout,
  getBlockedTiles,
  layoutToFurnitureInstances,
  layoutToSeats,
  layoutToTileMap,
} from '../layout/layoutSerializer.js';
import { findPath, getWalkableTiles, isWalkable } from '../layout/tileMap.js';
import type {
  Character,
  FurnitureInstance,
  OfficeLayout,
  PlacedFurniture,
  Seat,
  TileType as TileTypeVal,
} from '../types.js';
import { CharacterState, Direction, MATRIX_EFFECT_DURATION, TILE_SIZE } from '../types.js';
import { createCharacter, updateCharacter } from './characters.js';
import { matrixEffectSeeds } from './matrixEffect.js';

/** Compute the cardinal direction from one tile toward another */
function directionToward(
  fromCol: number,
  fromRow: number,
  toCol: number,
  toRow: number,
): Direction {
  const dc = toCol - fromCol;
  const dr = toRow - fromRow;
  // Prefer the axis with the larger delta
  if (Math.abs(dc) >= Math.abs(dr)) {
    return dc >= 0 ? Direction.RIGHT : Direction.LEFT;
  }
  return dr >= 0 ? Direction.DOWN : Direction.UP;
}

export class OfficeState {
  layout: OfficeLayout;
  tileMap: TileTypeVal[][];
  seats: Map<string, Seat>;
  blockedTiles: Set<string>;
  furniture: FurnitureInstance[];
  walkableTiles: Array<{ col: number; row: number }>;
  characters: Map<number, Character> = new Map();
  /** Accumulated time for furniture animation frame cycling */
  furnitureAnimTimer = 0;
  /** Screen shake timer (counts down from SCREEN_SHAKE_DURATION_SEC) */
  screenShakeTimer = 0;
  /** Error flash timer (counts down, renders red overlay) */
  errorFlashTimer = 0;
  /** Active paper airplane projectiles */
  paperAirplanes: Array<{
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    timer: number;
    duration: number;
  }> = [];
  /** Timer tracking how long ALL agents have been idle simultaneously */
  allIdleTimer = 0;
  /** Cooldown preventing all-idle fun from triggering too often */
  allIdleCooldown = 0;
  /** Screen shake pixel offset (updated each frame during shake) */
  screenShakeOffset = { x: 0, y: 0 };
  selectedAgentId: number | null = null;
  cameraFollowId: number | null = null;
  hoveredAgentId: number | null = null;
  hoveredTile: { col: number; row: number } | null = null;
  /** Maps "parentId:toolId" → sub-agent character ID (negative) */
  subagentIdMap: Map<string, number> = new Map();
  /** Reverse lookup: sub-agent character ID → parent info */
  subagentMeta: Map<number, { parentAgentId: number; parentToolId: string }> = new Map();
  private nextSubagentId = -1;

  constructor(layout?: OfficeLayout) {
    this.layout = layout || createDefaultLayout();
    this.tileMap = layoutToTileMap(this.layout);
    this.seats = layoutToSeats(this.layout.furniture);
    this.blockedTiles = getBlockedTiles(this.layout.furniture);
    this.furniture = layoutToFurnitureInstances(this.layout.furniture);
    this.walkableTiles = getWalkableTiles(this.tileMap, this.blockedTiles);
  }

  /** Rebuild all derived state from a new layout. Reassigns existing characters.
   *  @param shift Optional pixel shift to apply when grid expands left/up */
  rebuildFromLayout(layout: OfficeLayout, shift?: { col: number; row: number }): void {
    this.layout = layout;
    this.tileMap = layoutToTileMap(layout);
    this.seats = layoutToSeats(layout.furniture);
    this.blockedTiles = getBlockedTiles(layout.furniture);
    this.rebuildFurnitureInstances();
    this.walkableTiles = getWalkableTiles(this.tileMap, this.blockedTiles);

    // Shift character positions when grid expands left/up
    if (shift && (shift.col !== 0 || shift.row !== 0)) {
      for (const ch of this.characters.values()) {
        ch.tileCol += shift.col;
        ch.tileRow += shift.row;
        ch.x += shift.col * TILE_SIZE;
        ch.y += shift.row * TILE_SIZE;
        // Clear path since tile coords changed
        ch.path = [];
        ch.moveProgress = 0;
      }
    }

    // Reassign characters to new seats, preserving existing assignments when possible
    for (const seat of this.seats.values()) {
      seat.assigned = false;
    }

    // First pass: try to keep characters at their existing seats
    for (const ch of this.characters.values()) {
      if (ch.seatId && this.seats.has(ch.seatId)) {
        const seat = this.seats.get(ch.seatId)!;
        if (!seat.assigned) {
          seat.assigned = true;
          // Snap character to seat position
          ch.tileCol = seat.seatCol;
          ch.tileRow = seat.seatRow;
          const cx = seat.seatCol * TILE_SIZE + TILE_SIZE / 2;
          const cy = seat.seatRow * TILE_SIZE + TILE_SIZE / 2;
          ch.x = cx;
          ch.y = cy;
          ch.dir = seat.facingDir;
          continue;
        }
      }
      ch.seatId = null; // will be reassigned below
    }

    // Second pass: assign remaining characters to free seats (prefer desks)
    for (const ch of this.characters.values()) {
      if (ch.seatId) continue;
      const preferDesk = !ch.isSubagent;
      const seatId = this.findFreeSeat(preferDesk);
      if (seatId) {
        this.seats.get(seatId)!.assigned = true;
        ch.seatId = seatId;
        const seat = this.seats.get(seatId)!;
        ch.tileCol = seat.seatCol;
        ch.tileRow = seat.seatRow;
        ch.x = seat.seatCol * TILE_SIZE + TILE_SIZE / 2;
        ch.y = seat.seatRow * TILE_SIZE + TILE_SIZE / 2;
        ch.dir = seat.facingDir;
      }
    }

    // Relocate any characters that ended up outside bounds or on non-walkable tiles
    for (const ch of this.characters.values()) {
      if (ch.seatId) continue; // seated characters are fine
      if (
        ch.tileCol < 0 ||
        ch.tileCol >= layout.cols ||
        ch.tileRow < 0 ||
        ch.tileRow >= layout.rows
      ) {
        this.relocateCharacterToWalkable(ch);
      }
    }
  }

  /** Move a character to a random walkable tile */
  private relocateCharacterToWalkable(ch: Character): void {
    if (this.walkableTiles.length === 0) return;
    const spawn = this.walkableTiles[Math.floor(Math.random() * this.walkableTiles.length)];
    ch.tileCol = spawn.col;
    ch.tileRow = spawn.row;
    ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2;
    ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2;
    ch.path = [];
    ch.moveProgress = 0;
  }

  getLayout(): OfficeLayout {
    return this.layout;
  }

  /** Get the blocked-tile key for a character's own seat, or null */
  private ownSeatKey(ch: Character): string | null {
    if (!ch.seatId) return null;
    const seat = this.seats.get(ch.seatId);
    if (!seat) return null;
    return `${seat.seatCol},${seat.seatRow}`;
  }

  /** Temporarily unblock a character's own seat, run fn, then re-block */
  private withOwnSeatUnblocked<T>(ch: Character, fn: () => T): T {
    const key = this.ownSeatKey(ch);
    if (key) this.blockedTiles.delete(key);
    const result = fn();
    if (key) this.blockedTiles.add(key);
    return result;
  }

  /**
   * Find a free seat matching a project path by substring match against seat projectLabel.
   * Returns the best matching seat (closest to a PC preferred), or null.
   */
  findProjectSeat(projectPath: string): string | null {
    if (!projectPath) return null;
    // Extract folder name segments for matching (e.g., "/Users/foo/Code/tesla-site" → "tesla-site")
    const segments = projectPath.replace(/\\/g, '/').split('/').filter(Boolean);
    const available = Array.from(this.seats.entries())
      .filter(([, s]) => {
        if (s.assigned || !s.projectLabel) return false;
        // Match if projectPath contains the label as a folder segment or substring
        const label = s.projectLabel.toLowerCase();
        return (
          segments.some((seg) => seg.toLowerCase() === label) ||
          projectPath.toLowerCase().includes(label)
        );
      })
      .sort((a, b) => (a[1].pcDistance ?? Infinity) - (b[1].pcDistance ?? Infinity));
    return available.length > 0 ? available[0][0] : null;
  }

  private findFreeSeat(preferDesk?: boolean): string | null {
    if (preferDesk) {
      // Sort available seats: closest to PC first, then prefer UP-facing (classic workstation)
      const available = Array.from(this.seats.entries())
        .filter(([, s]) => !s.assigned && s.facesDesk)
        .sort((a, b) => {
          const distDiff = (a[1].pcDistance ?? Infinity) - (b[1].pcDistance ?? Infinity);
          if (distDiff !== 0) return distDiff;
          // Tiebreaker: prefer UP-facing seats (facing a desk above = classic workstation)
          const aUp = a[1].facingDir === Direction.UP ? 0 : 1;
          const bUp = b[1].facingDir === Direction.UP ? 0 : 1;
          return aUp - bUp;
        });
      if (available.length > 0) return available[0][0];
    } else if (preferDesk === false) {
      // First try non-desk seats (couches, lounge chairs)
      for (const [uid, seat] of this.seats) {
        if (!seat.assigned && !seat.facesDesk) return uid;
      }
    }
    // Fall back to any unassigned seat
    for (const [uid, seat] of this.seats) {
      if (!seat.assigned) return uid;
    }
    return null;
  }

  /**
   * Pick a diverse palette for a new agent based on currently active agents.
   * First 6 agents each get a unique skin (random order). Beyond 6, skins
   * repeat in balanced rounds with a random hue shift (≥45°).
   */
  private pickDiversePalette(): { palette: number; hueShift: number } {
    // Count how many non-sub-agents use each base palette (0-5)
    const counts = new Array(PALETTE_COUNT).fill(0) as number[];
    for (const ch of this.characters.values()) {
      if (ch.isSubagent) continue;
      counts[ch.palette]++;
    }
    const minCount = Math.min(...counts);
    // Available = palettes at the minimum count (least used)
    const available: number[] = [];
    for (let i = 0; i < PALETTE_COUNT; i++) {
      if (counts[i] === minCount) available.push(i);
    }
    const palette = available[Math.floor(Math.random() * available.length)];
    // First round (minCount === 0): no hue shift. Subsequent rounds: random ≥45°.
    let hueShift = 0;
    if (minCount > 0) {
      hueShift = HUE_SHIFT_MIN_DEG + Math.floor(Math.random() * HUE_SHIFT_RANGE_DEG);
    }
    return { palette, hueShift };
  }

  addAgent(
    id: number,
    preferredPalette?: number,
    preferredHueShift?: number,
    preferredSeatId?: string,
    skipSpawnEffect?: boolean,
    folderName?: string,
    projectPath?: string,
  ): void {
    if (this.characters.has(id)) return;

    let palette: number;
    let hueShift: number;
    if (preferredPalette !== undefined) {
      palette = preferredPalette;
      hueShift = preferredHueShift ?? 0;
    } else {
      const pick = this.pickDiversePalette();
      palette = pick.palette;
      hueShift = pick.hueShift;
    }

    // Try preferred seat first, then project-matching seat, then any free seat
    let seatId: string | null = null;
    if (preferredSeatId && this.seats.has(preferredSeatId)) {
      const seat = this.seats.get(preferredSeatId)!;
      if (!seat.assigned) {
        seatId = preferredSeatId;
      }
    }
    if (!seatId && projectPath) {
      // Try to find a seat at a desk labeled with this agent's project
      seatId = this.findProjectSeat(projectPath);
    }
    if (!seatId) {
      seatId = this.findFreeSeat(true);
    }

    let ch: Character;
    if (seatId) {
      const seat = this.seats.get(seatId)!;
      seat.assigned = true;
      ch = createCharacter(id, palette, seatId, seat, hueShift);
    } else {
      // No seats — spawn at random walkable tile in idle state
      const spawn =
        this.walkableTiles.length > 0
          ? this.walkableTiles[Math.floor(Math.random() * this.walkableTiles.length)]
          : { col: 1, row: 1 };
      ch = createCharacter(id, palette, null, null, hueShift);
      ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2;
      ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2;
      ch.tileCol = spawn.col;
      ch.tileRow = spawn.row;
      ch.state = CharacterState.IDLE; // don't show typing animation without a seat
    }

    if (folderName) {
      ch.folderName = folderName;
    }
    if (!skipSpawnEffect) {
      ch.matrixEffect = 'spawn';
      ch.matrixEffectTimer = 0;
      ch.matrixEffectSeeds = matrixEffectSeeds();
    }
    this.characters.set(id, ch);
  }

  removeAgent(id: number): void {
    const ch = this.characters.get(id);
    if (!ch) return;
    if (ch.matrixEffect === 'despawn') return; // already despawning
    // Free seat and clear selection immediately
    if (ch.seatId) {
      const seat = this.seats.get(ch.seatId);
      if (seat) seat.assigned = false;
    }
    if (this.selectedAgentId === id) this.selectedAgentId = null;
    if (this.cameraFollowId === id) this.cameraFollowId = null;
    // Start despawn animation instead of immediate delete
    ch.matrixEffect = 'despawn';
    ch.matrixEffectTimer = 0;
    ch.matrixEffectSeeds = matrixEffectSeeds();
    ch.bubbleType = null;
  }

  /** Find seat uid at a given tile position, or null */
  getSeatAtTile(col: number, row: number): string | null {
    for (const [uid, seat] of this.seats) {
      if (seat.seatCol === col && seat.seatRow === row) return uid;
    }
    return null;
  }

  /** Reassign an agent from their current seat to a new seat */
  reassignSeat(agentId: number, seatId: string): void {
    const ch = this.characters.get(agentId);
    if (!ch) return;
    // Unassign old seat
    if (ch.seatId) {
      const old = this.seats.get(ch.seatId);
      if (old) old.assigned = false;
    }
    // Assign new seat
    const seat = this.seats.get(seatId);
    if (!seat || seat.assigned) return;
    seat.assigned = true;
    ch.seatId = seatId;
    // Pathfind to new seat (unblock own seat tile for this query)
    const path = this.withOwnSeatUnblocked(ch, () =>
      findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, this.tileMap, this.blockedTiles),
    );
    if (path.length > 0) {
      ch.path = path;
      ch.moveProgress = 0;
      ch.state = CharacterState.WALK;
      ch.frame = 0;
      ch.frameTimer = 0;
    } else {
      // Already at seat or no path — sit down
      ch.state = CharacterState.TYPE;
      ch.dir = seat.facingDir;
      ch.frame = 0;
      ch.frameTimer = 0;
      if (!ch.isActive) {
        ch.seatTimer = INACTIVE_SEAT_TIMER_MIN_SEC + Math.random() * INACTIVE_SEAT_TIMER_RANGE_SEC;
      }
    }
  }

  /** Send an agent back to their currently assigned seat */
  sendToSeat(agentId: number): void {
    const ch = this.characters.get(agentId);
    if (!ch || !ch.seatId) return;
    const seat = this.seats.get(ch.seatId);
    if (!seat) return;
    const path = this.withOwnSeatUnblocked(ch, () =>
      findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, this.tileMap, this.blockedTiles),
    );
    if (path.length > 0) {
      ch.path = path;
      ch.moveProgress = 0;
      ch.state = CharacterState.WALK;
      ch.frame = 0;
      ch.frameTimer = 0;
    } else {
      // Already at seat — sit down
      ch.state = CharacterState.TYPE;
      ch.dir = seat.facingDir;
      ch.frame = 0;
      ch.frameTimer = 0;
      if (!ch.isActive) {
        ch.seatTimer = INACTIVE_SEAT_TIMER_MIN_SEC + Math.random() * INACTIVE_SEAT_TIMER_RANGE_SEC;
      }
    }
  }

  /** Walk an agent to an arbitrary walkable tile (right-click command) */
  walkToTile(agentId: number, col: number, row: number): boolean {
    const ch = this.characters.get(agentId);
    if (!ch || ch.isSubagent) return false;
    if (!isWalkable(col, row, this.tileMap, this.blockedTiles)) {
      // Also allow walking to own seat tile (blocked for others but not self)
      const key = this.ownSeatKey(ch);
      if (!key || key !== `${col},${row}`) return false;
    }
    const path = this.withOwnSeatUnblocked(ch, () =>
      findPath(ch.tileCol, ch.tileRow, col, row, this.tileMap, this.blockedTiles),
    );
    if (path.length === 0) return false;
    ch.path = path;
    ch.moveProgress = 0;
    ch.state = CharacterState.WALK;
    ch.frame = 0;
    ch.frameTimer = 0;
    return true;
  }

  /** Count active (non-despawning) sub-agents for a given parent */
  private countActiveSubagents(parentAgentId: number): number {
    let count = 0;
    for (const [, meta] of this.subagentMeta) {
      if (meta.parentAgentId === parentAgentId) {
        const subId = this.subagentIdMap.get(`${meta.parentAgentId}:${meta.parentToolId}`);
        if (subId !== undefined) {
          const ch = this.characters.get(subId);
          if (ch && ch.matrixEffect !== 'despawn') count++;
        }
      }
    }
    return count;
  }

  /** Create a sub-agent character with the parent's palette. Returns the sub-agent ID.
   *  Returns -0 (as a sentinel) if the cap of MAX_SUBAGENTS_PER_PARENT is reached. */
  addSubagent(parentAgentId: number, parentToolId: string): number {
    const key = `${parentAgentId}:${parentToolId}`;
    if (this.subagentIdMap.has(key)) return this.subagentIdMap.get(key)!;

    // Cap at MAX_SUBAGENTS_PER_PARENT visible sub-agents per parent
    if (this.countActiveSubagents(parentAgentId) >= MAX_SUBAGENTS_PER_PARENT) {
      return 0; // sentinel: sub-agent was not created
    }

    const id = this.nextSubagentId--;
    const parentCh = this.characters.get(parentAgentId);
    const palette = parentCh ? parentCh.palette : 0;
    const hueShift = parentCh ? parentCh.hueShift : 0;

    // Find the free seat closest to the parent agent.
    // Prefer non-desk seats (couches, lounge chairs) so sub-agents work on laptops from the couch.
    const parentCol = parentCh ? parentCh.tileCol : 0;
    const parentRow = parentCh ? parentCh.tileRow : 0;
    const dist = (c: number, r: number) => Math.abs(c - parentCol) + Math.abs(r - parentRow);

    let bestSeatId: string | null = null;
    let bestDist = Infinity;
    // First pass: non-desk seats only
    for (const [uid, seat] of this.seats) {
      if (!seat.assigned && !seat.facesDesk) {
        const d = dist(seat.seatCol, seat.seatRow);
        if (d < bestDist) {
          bestDist = d;
          bestSeatId = uid;
        }
      }
    }
    // Fallback: any free seat
    if (!bestSeatId) {
      bestDist = Infinity;
      for (const [uid, seat] of this.seats) {
        if (!seat.assigned) {
          const d = dist(seat.seatCol, seat.seatRow);
          if (d < bestDist) {
            bestDist = d;
            bestSeatId = uid;
          }
        }
      }
    }

    let ch: Character;
    if (bestSeatId) {
      const seat = this.seats.get(bestSeatId)!;
      seat.assigned = true;
      ch = createCharacter(id, palette, bestSeatId, seat, hueShift);
    } else {
      // No seats — spawn at closest walkable tile to parent
      let spawn = { col: 1, row: 1 };
      if (this.walkableTiles.length > 0) {
        let closest = this.walkableTiles[0];
        let closestDist = dist(closest.col, closest.row);
        for (let i = 1; i < this.walkableTiles.length; i++) {
          const d = dist(this.walkableTiles[i].col, this.walkableTiles[i].row);
          if (d < closestDist) {
            closest = this.walkableTiles[i];
            closestDist = d;
          }
        }
        spawn = closest;
      }
      ch = createCharacter(id, palette, null, null, hueShift);
      ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2;
      ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2;
      ch.tileCol = spawn.col;
      ch.tileRow = spawn.row;
    }
    ch.isSubagent = true;
    ch.hasLaptop = true;
    ch.parentAgentId = parentAgentId;
    ch.matrixEffect = 'spawn';
    ch.matrixEffectTimer = 0;
    ch.matrixEffectSeeds = matrixEffectSeeds();

    // Set up greeting animation: sub-agent and parent face each other after spawn
    if (parentCh) {
      ch.dir = directionToward(ch.tileCol, ch.tileRow, parentCh.tileCol, parentCh.tileRow);
      ch.greetingTimer = GREETING_DURATION_SEC;
      parentCh.dir = directionToward(parentCh.tileCol, parentCh.tileRow, ch.tileCol, ch.tileRow);
      parentCh.greetingTimer = GREETING_DURATION_SEC + GREETING_PARENT_EXTRA_SEC;
    }

    this.characters.set(id, ch);

    this.subagentIdMap.set(key, id);
    this.subagentMeta.set(id, { parentAgentId, parentToolId });
    return id;
  }

  /** Remove a specific sub-agent character and free its seat */
  removeSubagent(parentAgentId: number, parentToolId: string): void {
    const key = `${parentAgentId}:${parentToolId}`;
    const id = this.subagentIdMap.get(key);
    if (id === undefined) return;

    const ch = this.characters.get(id);
    if (ch) {
      if (ch.matrixEffect === 'despawn') {
        // Already despawning — just clean up maps
        this.subagentIdMap.delete(key);
        this.subagentMeta.delete(id);
        return;
      }
      if (ch.seatId) {
        const seat = this.seats.get(ch.seatId);
        if (seat) seat.assigned = false;
      }
      // Start despawn animation — keep character in map for rendering
      ch.matrixEffect = 'despawn';
      ch.matrixEffectTimer = 0;
      ch.matrixEffectSeeds = matrixEffectSeeds();
      ch.bubbleType = null;
    }
    // Clean up tracking maps immediately so keys don't collide
    this.subagentIdMap.delete(key);
    this.subagentMeta.delete(id);
    if (this.selectedAgentId === id) this.selectedAgentId = null;
    if (this.cameraFollowId === id) this.cameraFollowId = null;
  }

  /** Remove all sub-agents belonging to a parent agent */
  removeAllSubagents(parentAgentId: number): void {
    const toRemove: string[] = [];
    for (const [key, id] of this.subagentIdMap) {
      const meta = this.subagentMeta.get(id);
      if (meta && meta.parentAgentId === parentAgentId) {
        const ch = this.characters.get(id);
        if (ch) {
          if (ch.matrixEffect === 'despawn') {
            // Already despawning — just clean up maps
            this.subagentMeta.delete(id);
            toRemove.push(key);
            continue;
          }
          if (ch.seatId) {
            const seat = this.seats.get(ch.seatId);
            if (seat) seat.assigned = false;
          }
          // Start despawn animation
          ch.matrixEffect = 'despawn';
          ch.matrixEffectTimer = 0;
          ch.matrixEffectSeeds = matrixEffectSeeds();
          ch.bubbleType = null;
        }
        this.subagentMeta.delete(id);
        if (this.selectedAgentId === id) this.selectedAgentId = null;
        if (this.cameraFollowId === id) this.cameraFollowId = null;
        toRemove.push(key);
      }
    }
    for (const key of toRemove) {
      this.subagentIdMap.delete(key);
    }
  }

  /** Look up the sub-agent character ID for a given parent+toolId, or null */
  getSubagentId(parentAgentId: number, parentToolId: string): number | null {
    return this.subagentIdMap.get(`${parentAgentId}:${parentToolId}`) ?? null;
  }

  setAgentActive(id: number, active: boolean): void {
    const ch = this.characters.get(id);
    if (ch) {
      const wasActive = ch.isActive;
      ch.isActive = active;
      if (active) {
        // Clear sleep/cosmetic bubbles when agent wakes up (preserve permission)
        if (ch.bubbleType === 'sleep') {
          ch.bubbleType = null;
          ch.bubbleTimer = 0;
        }
        ch.idleTimer = 0;
        // Start tracking turn duration
        if (!wasActive) {
          ch.turnTimer = 0;
        }
        // Abort any amenity/whiteboard visit and return to seat
        if (ch.amenityVisit) {
          const returnSeatId = ch.amenityVisit.returnSeatId;
          ch.amenityVisit = undefined;
          if (returnSeatId && !ch.seatId) {
            const seat = this.seats.get(returnSeatId);
            if (seat && !seat.assigned) {
              seat.assigned = true;
              ch.seatId = returnSeatId;
            }
          }
        }
        if (ch.whiteboardVisit) {
          const returnSeatId = ch.whiteboardVisit.returnSeatId;
          ch.whiteboardVisit = undefined;
          if (returnSeatId && !ch.seatId) {
            const seat = this.seats.get(returnSeatId);
            if (seat && !seat.assigned) {
              seat.assigned = true;
              ch.seatId = returnSeatId;
            }
          }
        }
      } else {
        // Turn just ended — check for "I'm in" celebration on long turns
        if (
          wasActive &&
          ch.turnTimer >= LONG_TURN_THRESHOLD_SEC &&
          Math.random() < CELEBRATION_CHANCE
        ) {
          this.showReactionBubble(id, 'idea');
        }
        ch.turnTimer = 0;
        // Sentinel -1: signals turn just ended, skip next seat rest timer.
        // Prevents the WALK handler from setting a 2-4 min rest on arrival.
        ch.seatTimer = -1;
        ch.path = [];
        ch.moveProgress = 0;
      }
      this.rebuildFurnitureInstances();
    }
  }

  /** Update agent's project and reassign to a project-labeled desk if available */
  updateAgentProject(id: number, project: string): void {
    const ch = this.characters.get(id);
    if (!ch || ch.isSubagent) return;

    // Check if project actually changed
    const currentProject = ch.projectPath?.split('/').pop()?.toLowerCase();
    if (currentProject === project.toLowerCase()) return;

    ch.projectPath = project;

    // Try to find a desk labeled for this project
    const newSeatId = this.findProjectSeat(project);
    if (newSeatId && newSeatId !== ch.seatId) {
      // Release current seat
      if (ch.seatId) {
        const oldSeat = this.seats.get(ch.seatId);
        if (oldSeat) oldSeat.assigned = false;
      }
      // Claim new seat
      const newSeat = this.seats.get(newSeatId)!;
      newSeat.assigned = true;
      ch.seatId = newSeatId;
      // Pathfind to new seat
      const path = this.withOwnSeatUnblocked(ch, () =>
        findPath(
          ch.tileCol,
          ch.tileRow,
          newSeat.seatCol,
          newSeat.seatRow,
          this.tileMap,
          this.blockedTiles,
        ),
      );
      if (path.length > 0) {
        ch.path = path;
        ch.moveProgress = 0;
        ch.state = CharacterState.WALK;
        ch.frame = 0;
        ch.frameTimer = 0;
      } else {
        // Can't pathfind — snap to seat
        ch.tileCol = newSeat.seatCol;
        ch.tileRow = newSeat.seatRow;
        ch.x = newSeat.seatCol * TILE_SIZE + TILE_SIZE / 2;
        ch.y = newSeat.seatRow * TILE_SIZE + TILE_SIZE / 2;
      }
      ch.dir = newSeat.facingDir;
      this.rebuildFurnitureInstances();
    } else if (!newSeatId && ch.seatId) {
      // No labeled desk for this project — auto-label the current desk
      this.autoLabelDesk(ch.seatId, project);
    }
  }

  /** Auto-label the desk adjacent to a seat with a project name */
  private autoLabelDesk(seatId: string, project: string): void {
    const seat = this.seats.get(seatId);
    if (!seat || seat.projectLabel) return; // already labeled

    for (const item of this.layout.furniture) {
      const entry = getCatalogEntry(item.type);
      if (!entry || !entry.isDesk) continue;
      for (let dr = 0; dr < entry.footprintH; dr++) {
        for (let dc = 0; dc < entry.footprintW; dc++) {
          const dist =
            Math.abs(seat.seatCol - (item.col + dc)) + Math.abs(seat.seatRow - (item.row + dr));
          if (dist <= 1) {
            item.projectLabel = project;
            // Rebuild seats to propagate the label
            this.seats = layoutToSeats(this.layout.furniture);
            for (const ch of this.characters.values()) {
              if (ch.seatId) {
                const s = this.seats.get(ch.seatId);
                if (s) s.assigned = true;
              }
            }
            return;
          }
        }
      }
    }
  }

  /** Rebuild furniture instances with auto-state applied (active agents turn electronics ON) */
  private rebuildFurnitureInstances(): void {
    // Collect tiles where active agents face desks
    const autoOnTiles = new Set<string>();
    for (const ch of this.characters.values()) {
      if (!ch.isActive || !ch.seatId) continue;
      const seat = this.seats.get(ch.seatId);
      if (!seat) continue;
      // Find the desk tile(s) the agent faces from their seat
      const dCol =
        seat.facingDir === Direction.RIGHT ? 1 : seat.facingDir === Direction.LEFT ? -1 : 0;
      const dRow = seat.facingDir === Direction.DOWN ? 1 : seat.facingDir === Direction.UP ? -1 : 0;
      // Check tiles in the facing direction (desk could be 1-3 tiles deep)
      for (let d = 1; d <= AUTO_ON_FACING_DEPTH; d++) {
        const tileCol = seat.seatCol + dCol * d;
        const tileRow = seat.seatRow + dRow * d;
        autoOnTiles.add(`${tileCol},${tileRow}`);
      }
      // Also check tiles to the sides of the facing direction (desks can be wide)
      for (let d = 1; d <= AUTO_ON_SIDE_DEPTH; d++) {
        const baseCol = seat.seatCol + dCol * d;
        const baseRow = seat.seatRow + dRow * d;
        if (dCol !== 0) {
          // Facing left/right: check tiles above and below
          autoOnTiles.add(`${baseCol},${baseRow - 1}`);
          autoOnTiles.add(`${baseCol},${baseRow + 1}`);
        } else {
          // Facing up/down: check tiles left and right
          autoOnTiles.add(`${baseCol - 1},${baseRow}`);
          autoOnTiles.add(`${baseCol + 1},${baseRow}`);
        }
      }
    }

    // Build modified furniture list with auto-state and always-on animation applied
    const animFrame = Math.floor(this.furnitureAnimTimer / FURNITURE_ANIM_INTERVAL_SEC);
    const ambientFrame = Math.floor(this.furnitureAnimTimer / AMBIENT_ANIM_INTERVAL_SEC);
    const modifiedFurniture: PlacedFurniture[] = this.layout.furniture.map((item) => {
      const entry = getCatalogEntry(item.type);
      if (!entry) return item;

      // Always-on animation: cycle frames for items with animationGroup (e.g. fish tank)
      const frames = getAnimationFrames(item.type);
      if (frames && frames.length > 1) {
        const frameIdx = ambientFrame % frames.length;
        if (frames[frameIdx] !== item.type) {
          return { ...item, type: frames[frameIdx] };
        }
        return item;
      }

      // Auto-state: check if any tile of this furniture overlaps an auto-on tile
      if (autoOnTiles.size > 0) {
        for (let dr = 0; dr < entry.footprintH; dr++) {
          for (let dc = 0; dc < entry.footprintW; dc++) {
            if (autoOnTiles.has(`${item.col + dc},${item.row + dr}`)) {
              let onType = getOnStateType(item.type);
              if (onType !== item.type) {
                // Check if the on-state type has animation frames
                const onFrames = getAnimationFrames(onType);
                if (onFrames && onFrames.length > 1) {
                  const frameIdx2 = animFrame % onFrames.length;
                  onType = onFrames[frameIdx2];
                }
                return { ...item, type: onType };
              }
              return item;
            }
          }
        }
      }

      return item;
    });

    this.furniture = layoutToFurnitureInstances(modifiedFurniture);

    // Mark electronics near active agents as glowing
    if (autoOnTiles.size > 0) {
      for (let i = 0; i < modifiedFurniture.length; i++) {
        const item = modifiedFurniture[i];
        const entry = getCatalogEntry(item.type);
        if (!entry || entry.category !== 'electronics') continue;
        for (let dr = 0; dr < entry.footprintH; dr++) {
          for (let dc = 0; dc < entry.footprintW; dc++) {
            if (autoOnTiles.has(`${item.col + dc},${item.row + dr}`)) {
              this.furniture[i].glowing = true;
              break;
            }
          }
          if (this.furniture[i].glowing) break;
        }
      }
    }
  }

  setAgentTool(id: number, tool: string | null): void {
    const ch = this.characters.get(id);
    if (ch) {
      ch.currentTool = tool;
    }
  }

  showPermissionBubble(id: number): void {
    const ch = this.characters.get(id);
    if (ch) {
      ch.bubbleType = 'permission';
      ch.bubbleTimer = 0;
      ch.permissionTimer = 0;
    }
  }

  clearPermissionBubble(id: number): void {
    const ch = this.characters.get(id);
    if (ch && ch.bubbleType === 'permission') {
      ch.bubbleType = null;
      ch.bubbleTimer = 0;
    }
  }

  showWaitingBubble(id: number): void {
    const ch = this.characters.get(id);
    if (ch) {
      ch.bubbleType = 'waiting';
      ch.bubbleTimer = WAITING_BUBBLE_DURATION_SEC;
    }
  }

  /** Trigger screen shake effect */
  triggerScreenShake(): void {
    this.screenShakeTimer = SCREEN_SHAKE_DURATION_SEC;
  }

  /** Trigger error flash (brief red overlay) */
  triggerErrorFlash(agentId: number): void {
    this.errorFlashTimer = 0.4;
    this.showReactionBubble(agentId, 'sweat');
  }

  /** Show a timed reaction bubble (alert, confused, sweat, idea, heart) that auto-fades */
  showReactionBubble(id: number, type: 'alert' | 'confused' | 'sweat' | 'idea' | 'heart'): void {
    const ch = this.characters.get(id);
    if (!ch) return;
    // Don't override permission bubbles (those are functional, not cosmetic)
    if (ch.bubbleType === 'permission') return;
    ch.bubbleType = type;
    ch.bubbleTimer = REACTION_BUBBLE_DURATION_SEC;
  }

  /** Show sleep bubble (stays until agent becomes active) */
  showSleepBubble(id: number): void {
    const ch = this.characters.get(id);
    if (!ch) return;
    if (ch.bubbleType === 'permission') return;
    ch.bubbleType = 'sleep';
    ch.bubbleTimer = 0; // no auto-fade — cleared when agent becomes active
  }

  /** Dismiss bubble on click — permission: instant, timed: quick fade */
  dismissBubble(id: number): void {
    const ch = this.characters.get(id);
    if (!ch || !ch.bubbleType) return;
    if (ch.bubbleType === 'permission') {
      ch.bubbleType = null;
      ch.bubbleTimer = 0;
    } else if (ch.bubbleType === 'sleep') {
      ch.bubbleType = null;
      ch.bubbleTimer = 0;
    } else {
      // Timed bubbles: trigger immediate fade
      ch.bubbleTimer = Math.min(ch.bubbleTimer, DISMISS_BUBBLE_FAST_FADE_SEC);
    }
  }

  update(dt: number): void {
    // Furniture animation cycling (check both fast and ambient intervals)
    const prevFrame = Math.floor(this.furnitureAnimTimer / FURNITURE_ANIM_INTERVAL_SEC);
    const prevAmbient = Math.floor(this.furnitureAnimTimer / AMBIENT_ANIM_INTERVAL_SEC);
    this.furnitureAnimTimer += dt;
    const newFrame = Math.floor(this.furnitureAnimTimer / FURNITURE_ANIM_INTERVAL_SEC);
    const newAmbient = Math.floor(this.furnitureAnimTimer / AMBIENT_ANIM_INTERVAL_SEC);
    if (newFrame !== prevFrame || newAmbient !== prevAmbient) {
      this.rebuildFurnitureInstances();
    }

    // Screen shake update
    if (this.screenShakeTimer > 0) {
      this.screenShakeTimer -= dt;
      if (this.screenShakeTimer <= 0) {
        this.screenShakeTimer = 0;
        this.screenShakeOffset = { x: 0, y: 0 };
      } else {
        this.screenShakeOffset = {
          x: (Math.random() * 2 - 1) * SCREEN_SHAKE_INTENSITY,
          y: (Math.random() * 2 - 1) * SCREEN_SHAKE_INTENSITY,
        };
      }
    }

    // Error flash countdown
    if (this.errorFlashTimer > 0) {
      this.errorFlashTimer -= dt;
      if (this.errorFlashTimer <= 0) this.errorFlashTimer = 0;
    }

    // Paper airplane animation
    for (let i = this.paperAirplanes.length - 1; i >= 0; i--) {
      this.paperAirplanes[i].timer += dt;
      if (this.paperAirplanes[i].timer >= this.paperAirplanes[i].duration) {
        this.paperAirplanes.splice(i, 1);
      }
    }

    const toDelete: number[] = [];
    for (const ch of this.characters.values()) {
      // Handle matrix effect animation
      if (ch.matrixEffect) {
        ch.matrixEffectTimer += dt;
        if (ch.matrixEffectTimer >= MATRIX_EFFECT_DURATION) {
          if (ch.matrixEffect === 'spawn') {
            // Spawn complete — clear effect, resume normal FSM
            ch.matrixEffect = null;
            ch.matrixEffectTimer = 0;
            ch.matrixEffectSeeds = [];
          } else {
            // Despawn complete — mark for deletion
            toDelete.push(ch.id);
          }
        }
        continue; // skip normal FSM while effect is active
      }

      // Greeting pause: character stands facing partner, skip normal FSM
      if (ch.greetingTimer !== undefined && ch.greetingTimer > 0) {
        // Show standing pose during greeting (IDLE uses walk frame 1 = standing)
        if (ch.state !== CharacterState.IDLE) {
          ch.state = CharacterState.IDLE;
          ch.frame = 0;
          ch.frameTimer = 0;
        }
        ch.greetingTimer -= dt;
        if (ch.greetingTimer <= 0) {
          ch.greetingTimer = undefined;
        }
        continue;
      }

      // Temporarily unblock own seat so character can pathfind to it
      this.withOwnSeatUnblocked(ch, () =>
        updateCharacter(ch, dt, this.walkableTiles, this.seats, this.tileMap, this.blockedTiles),
      );

      // Printer beatdown effects: screen shake + nearby agent reactions
      if (
        ch.amenityVisit?.printerBeatdown &&
        ch.amenityVisit.phase === 'using' &&
        !ch.amenityVisit.beatdownShakeFired
      ) {
        ch.amenityVisit.beatdownShakeFired = true;
        this.triggerScreenShake();
        // Show alert bubbles on nearby characters
        for (const other of this.characters.values()) {
          if (other.id === ch.id) continue;
          const dist = Math.abs(other.tileCol - ch.tileCol) + Math.abs(other.tileRow - ch.tileRow);
          if (dist <= 8) {
            this.showReactionBubble(other.id, 'alert');
          }
        }
      }

      // High-five: show heart bubbles when handoff visit reaches 'using' phase
      if (ch.amenityVisit?.amenityType === 'HANDOFF' && ch.amenityVisit.phase === 'using') {
        // Show heart once at the start of the using phase (timer is at max)
        if (ch.amenityVisit.timer >= HANDOFF_VISIT_USE_SEC - 0.05) {
          this.showReactionBubble(ch.id, 'heart');
          // Find the colleague they're visiting and show heart on them too
          for (const other of this.characters.values()) {
            if (other.id === ch.id) continue;
            const dist =
              Math.abs(other.tileCol - ch.tileCol) + Math.abs(other.tileRow - ch.tileRow);
            if (dist <= 2 && other.seatId) {
              this.showReactionBubble(other.id, 'heart');
              break;
            }
          }
        }
      }

      // Random amenity visit trigger for idle agents at their desk
      if (
        !ch.isActive &&
        !ch.isSubagent &&
        ch.seatId &&
        !ch.amenityVisit &&
        !ch.whiteboardVisit &&
        ch.state === CharacterState.IDLE &&
        ch.wanderCount === 0 &&
        Math.random() < AMENITY_VISIT_CHANCE * dt // per-frame chance scaled by dt
      ) {
        this.triggerAmenityVisit(ch.id);
      }

      // Random desk visit for idle agents (lower priority than amenity visits)
      if (
        !ch.isActive &&
        !ch.isSubagent &&
        ch.seatId &&
        !ch.amenityVisit &&
        !ch.whiteboardVisit &&
        ch.state === CharacterState.IDLE &&
        ch.wanderCount === 0 &&
        Math.random() < DESK_VISIT_CHANCE * dt
      ) {
        this.triggerDeskVisit(ch.id);
      }

      // Rubber duck debugging: idle agent at desk occasionally has an epiphany
      if (
        !ch.isActive &&
        !ch.isSubagent &&
        ch.seatId &&
        !ch.amenityVisit &&
        !ch.whiteboardVisit &&
        ch.state === CharacterState.IDLE &&
        ch.wanderCount === 0 &&
        !ch.bubbleType &&
        Math.random() < RUBBER_DUCK_CHANCE * dt
      ) {
        this.triggerRubberDuck(ch.id);
      }

      // Tick bubble timer for timed bubbles (waiting + reactions, but not permission/sleep)
      if (
        ch.bubbleType &&
        ch.bubbleType !== 'permission' &&
        ch.bubbleType !== 'sleep' &&
        ch.bubbleTimer > 0
      ) {
        ch.bubbleTimer -= dt;
        if (ch.bubbleTimer <= 0) {
          ch.bubbleType = null;
          ch.bubbleTimer = 0;
        }
      }

      // Permission impatience: after 15s, periodically show sweat bubble
      if (ch.bubbleType === 'permission') {
        ch.permissionTimer += dt;
        if (ch.permissionTimer >= PERMISSION_IMPATIENT_SEC) {
          // Every PERMISSION_SWEAT_INTERVAL_SEC after the threshold, briefly flash sweat
          const elapsed = ch.permissionTimer - PERMISSION_IMPATIENT_SEC;
          const prevInterval = Math.floor((elapsed - dt) / PERMISSION_SWEAT_INTERVAL_SEC);
          const currInterval = Math.floor(elapsed / PERMISSION_SWEAT_INTERVAL_SEC);
          if (currInterval > prevInterval) {
            // Briefly show sweat, then restore permission bubble
            ch.bubbleType = 'sweat';
            ch.bubbleTimer = REACTION_BUBBLE_DURATION_SEC;
            // The timer tick above will auto-clear sweat → null, then the extension
            // will re-show permission on next check. But we want to restore it ourselves.
            // Store that we need to restore permission after the sweat fades.
            ch.permissionTimer = PERMISSION_IMPATIENT_SEC; // reset to retrigger later
          }
        }
      } else {
        ch.permissionTimer = 0;
      }

      // Track active turn duration
      if (ch.isActive) {
        ch.turnTimer += dt;
      }

      // Track idle time — show sleep bubble after extended inactivity
      if (!ch.isActive && !ch.isSubagent && ch.seatId && !ch.amenityVisit && !ch.whiteboardVisit) {
        ch.idleTimer += dt;
        if (
          ch.idleTimer >= SLEEP_IDLE_THRESHOLD_SEC &&
          ch.bubbleType !== 'sleep' &&
          ch.bubbleType !== 'permission'
        ) {
          this.showSleepBubble(ch.id);
        }
      } else {
        ch.idleTimer = 0;
      }
    }

    // All-idle fun: when every non-sub-agent is idle for a while, trigger a group reaction
    if (this.allIdleCooldown > 0) {
      this.allIdleCooldown -= dt;
    }
    let allIdle = true;
    let nonSubCount = 0;
    for (const ch of this.characters.values()) {
      if (ch.isSubagent || ch.matrixEffect) continue;
      nonSubCount++;
      if (ch.isActive || ch.amenityVisit || ch.whiteboardVisit) {
        allIdle = false;
        break;
      }
    }
    if (allIdle && nonSubCount >= 2 && this.allIdleCooldown <= 0) {
      this.allIdleTimer += dt;
      if (this.allIdleTimer >= ALL_IDLE_THRESHOLD_SEC) {
        this.allIdleTimer = 0;
        this.allIdleCooldown = ALL_IDLE_FUN_COOLDOWN_SEC;
        // 50% chance whiteboard argument, 50% wave of bubbles
        if (Math.random() < 0.5) {
          this.triggerWhiteboardArgument();
        } else {
          this.triggerAllIdleFun();
        }
      }
    } else if (!allIdle) {
      this.allIdleTimer = 0;
    }

    // Rare whiteboard argument (independent of all-idle)
    if (nonSubCount >= 2 && Math.random() < WHITEBOARD_ARGUMENT_CHANCE * dt) {
      this.triggerWhiteboardArgument();
    }

    // Remove characters that finished despawn
    for (const id of toDelete) {
      this.characters.delete(id);
    }
  }

  getDeskLabels(): Array<{ col: number; row: number; label: string }> {
    const labels: Array<{ col: number; row: number; label: string }> = [];

    // Collect tiles that already have a furniture-based project label so we don't overlap
    const labeledTiles = new Set<string>();

    // First pass: labels from PlacedFurniture.projectLabel on desks
    for (const item of this.layout.furniture) {
      if (!item.projectLabel) continue;
      const entry = getCatalogEntry(item.type);
      if (!entry || !entry.isDesk) continue;
      // Center the label on the desk footprint
      const centerCol = item.col + Math.floor(entry.footprintW / 2);
      const centerRow = item.row + Math.floor(entry.footprintH / 2);
      labels.push({ col: centerCol, row: centerRow, label: item.projectLabel });
      // Mark all footprint tiles as labeled
      for (let dr = 0; dr < entry.footprintH; dr++) {
        for (let dc = 0; dc < entry.footprintW; dc++) {
          labeledTiles.add(`${item.col + dc},${item.row + dr}`);
        }
      }
    }

    // Second pass: labels from seated agents at workstations only
    // Only show when the seat faces a desk AND is near a PC (real workstation, not meeting table)
    for (const [, ch] of this.characters) {
      if (ch.isSubagent || !ch.seatId) continue;
      const seat = this.seats.get(ch.seatId);
      if (!seat || !seat.facesDesk) continue; // must face a desk with nearby PC
      const label = ch.projectPath ? ch.projectPath.split('/').pop() || '' : ch.folderName || '';
      if (!label) continue;
      // Place label on the desk tile (one tile in the facing direction from the seat)
      const dirOffsets: Record<number, { dc: number; dr: number }> = {
        [Direction.UP]: { dc: 0, dr: -1 },
        [Direction.DOWN]: { dc: 0, dr: 1 },
        [Direction.LEFT]: { dc: -1, dr: 0 },
        [Direction.RIGHT]: { dc: 1, dr: 0 },
      };
      const d = dirOffsets[seat.facingDir] || { dc: 0, dr: -1 };
      const deskCol = seat.seatCol + d.dc;
      const deskRow = seat.seatRow + d.dr;
      // Skip if this tile is already covered by a furniture project label
      if (labeledTiles.has(`${deskCol},${deskRow}`)) continue;
      labels.push({ col: deskCol, row: deskRow, label });
    }
    return labels;
  }

  getClockPositions(): Array<{ col: number; row: number }> {
    const results: Array<{ col: number; row: number }> = [];
    for (const item of this.layout.furniture) {
      if (item.type.toUpperCase().includes('CLOCK')) {
        results.push({ col: item.col, row: item.row });
      }
    }
    return results;
  }

  getWhiteboardPositions(): Array<{ col: number; row: number; width: number; height: number }> {
    const results: Array<{ col: number; row: number; width: number; height: number }> = [];
    for (const item of this.layout.furniture) {
      if (item.type.toUpperCase().includes('WHITEBOARD')) {
        results.push({ col: item.col, row: item.row, width: 2, height: 2 });
      }
    }
    return results;
  }

  triggerWhiteboardVisit(agentId: number): void {
    const ch = this.characters.get(agentId);
    if (!ch || !ch.seatId || ch.whiteboardVisit) return;
    const whiteboards = this.getWhiteboardPositions();
    if (whiteboards.length === 0) return;
    // Pick the nearest whiteboard
    let bestWb = whiteboards[0];
    let bestDist = Math.abs(ch.tileCol - bestWb.col) + Math.abs(ch.tileRow - bestWb.row);
    for (let i = 1; i < whiteboards.length; i++) {
      const d =
        Math.abs(ch.tileCol - whiteboards[i].col) + Math.abs(ch.tileRow - whiteboards[i].row);
      if (d < bestDist) {
        bestDist = d;
        bestWb = whiteboards[i];
      }
    }
    // Stand in front of whiteboard (one row below it)
    const targetCol = bestWb.col;
    const targetRow = bestWb.row + bestWb.height;
    const returnSeatId = ch.seatId;
    ch.whiteboardVisit = {
      phase: 'walking_to',
      targetCol,
      targetRow,
      returnSeatId,
      timer: 0,
    };
    // Release current seat so character can walk freely
    const seat = this.seats.get(ch.seatId);
    if (seat) seat.assigned = false;
    ch.seatId = null;
    // Start walking to the whiteboard
    const path = this.withOwnSeatUnblocked(ch, () =>
      findPath(ch.tileCol, ch.tileRow, targetCol, targetRow, this.tileMap, this.blockedTiles),
    );
    if (path.length > 0) {
      ch.path = path;
      ch.moveProgress = 0;
      ch.state = CharacterState.WALK;
      ch.frame = 0;
      ch.frameTimer = 0;
    }
  }

  /** Get positions of amenity furniture (water cooler, coffee machine — NOT whiteboards) */
  getAmenityPositions(): Array<{ col: number; row: number; type: string }> {
    const results: Array<{ col: number; row: number; type: string }> = [];
    for (const item of this.layout.furniture) {
      const upper = item.type.toUpperCase();
      if (AMENITY_FURNITURE_TYPES.some((t) => t !== 'WHITEBOARD' && upper.includes(t))) {
        results.push({ col: item.col, row: item.row, type: item.type });
      }
    }
    return results;
  }

  /** Trigger an amenity visit (water cooler or coffee run) for an idle agent */
  triggerAmenityVisit(agentId: number): void {
    const ch = this.characters.get(agentId);
    if (!ch || !ch.seatId || ch.whiteboardVisit || ch.amenityVisit || ch.isSubagent) return;
    if (ch.isActive) return; // only idle agents visit amenities

    const amenities = this.getAmenityPositions();
    if (amenities.length === 0) return;

    // Pick a random amenity (not necessarily nearest — adds variety)
    const amenity = amenities[Math.floor(Math.random() * amenities.length)];

    // Stand one tile below the amenity (facing up toward it)
    const targetCol = amenity.col;
    const targetRow = amenity.row + 1;
    const returnSeatId = ch.seatId;

    // Roll the dice for printer Office Space easter egg
    const isPrinterBeatdown =
      amenity.type.startsWith('PRINTER') && Math.random() < PRINTER_BEATDOWN_CHANCE;

    ch.amenityVisit = {
      phase: 'walking_to',
      amenityType: amenity.type,
      targetCol,
      targetRow,
      returnSeatId,
      timer: 0,
      ...(isPrinterBeatdown ? { printerBeatdown: true } : {}),
    };

    // Release seat so character can walk freely
    const seat = this.seats.get(ch.seatId);
    if (seat) seat.assigned = false;
    ch.seatId = null;

    // Start walking
    const path = this.withOwnSeatUnblocked(ch, () =>
      findPath(ch.tileCol, ch.tileRow, targetCol, targetRow, this.tileMap, this.blockedTiles),
    );
    if (path.length > 0) {
      ch.path = path;
      ch.moveProgress = 0;
      ch.state = CharacterState.WALK;
      ch.frame = 0;
      ch.frameTimer = 0;
    } else {
      // Can't path — abort
      ch.amenityVisit = undefined;
      if (seat) seat.assigned = true;
      ch.seatId = returnSeatId;
    }
  }

  /** Trigger a desk visit: idle agent walks to another idle same-project agent's desk */
  triggerDeskVisit(agentId: number): void {
    const ch = this.characters.get(agentId);
    if (!ch || !ch.seatId || ch.whiteboardVisit || ch.amenityVisit || ch.isSubagent) return;
    if (ch.isActive) return;

    // Find another idle, seated, non-sub-agent on the same project
    const myProject = ch.projectPath;
    const candidates: Character[] = [];
    for (const [, other] of this.characters) {
      if (other.id === agentId || other.isSubagent || !other.seatId) continue;
      if (other.isActive || other.whiteboardVisit || other.amenityVisit) continue;
      // Same project check via last path segment
      if (myProject && other.projectPath) {
        const myFolder = myProject.split('/').pop()?.toLowerCase();
        const otherFolder = other.projectPath.split('/').pop()?.toLowerCase();
        if (myFolder !== otherFolder) continue;
      } else {
        continue; // skip if no project info
      }
      candidates.push(other);
    }
    if (candidates.length === 0) return;

    // Pick random candidate
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    const targetSeat = this.seats.get(target.seatId!);
    if (!targetSeat) return;

    // Walk to one tile adjacent to the target's seat (below them, facing up)
    const targetCol = targetSeat.seatCol;
    const targetRow = targetSeat.seatRow + 1;

    // Compute facing direction from walk-to position toward the target agent
    const facingDir = directionToward(targetCol, targetRow, targetSeat.seatCol, targetSeat.seatRow);

    const returnSeatId = ch.seatId;

    ch.amenityVisit = {
      phase: 'walking_to',
      amenityType: 'DESK_VISIT',
      targetCol,
      targetRow,
      returnSeatId,
      timer: 0,
      facingDir,
    };

    // Release seat so character can walk freely
    const seat = this.seats.get(ch.seatId);
    if (seat) seat.assigned = false;
    ch.seatId = null;

    const path = this.withOwnSeatUnblocked(ch, () =>
      findPath(ch.tileCol, ch.tileRow, targetCol, targetRow, this.tileMap, this.blockedTiles),
    );
    if (path.length > 0) {
      ch.path = path;
      ch.moveProgress = 0;
      ch.state = CharacterState.WALK;
      ch.frame = 0;
      ch.frameTimer = 0;
    } else {
      // Can't path — abort
      ch.amenityVisit = undefined;
      if (seat) seat.assigned = true;
      ch.seatId = returnSeatId;
    }
  }

  /** Rubber duck debugging: agent briefly shows confused then idea bubble at their desk */
  triggerRubberDuck(agentId: number): void {
    const ch = this.characters.get(agentId);
    if (!ch || !ch.seatId || ch.amenityVisit || ch.whiteboardVisit || ch.isSubagent) return;
    if (ch.isActive) return;

    // Show confused bubble, then after a delay show idea
    this.showReactionBubble(agentId, 'confused');
    // Schedule idea bubble after stare duration
    setTimeout(() => {
      const c = this.characters.get(agentId);
      if (c && !c.isActive && c.bubbleType !== 'permission') {
        this.showReactionBubble(agentId, 'idea');
      }
    }, RUBBER_DUCK_STARE_SEC * 1000);
  }

  /** Whiteboard argument: two idle agents take turns at the whiteboard with ! bubbles */
  triggerWhiteboardArgument(): void {
    // Find two idle, non-sub-agent, seated characters
    const candidates: Character[] = [];
    for (const ch of this.characters.values()) {
      if (
        !ch.isActive &&
        !ch.isSubagent &&
        ch.seatId &&
        !ch.amenityVisit &&
        !ch.whiteboardVisit &&
        ch.state === CharacterState.IDLE &&
        ch.wanderCount === 0
      ) {
        candidates.push(ch);
      }
    }
    if (candidates.length < 2) return;

    // Pick two random agents
    const shuffled = candidates.sort(() => Math.random() - 0.5);
    const agent1 = shuffled[0];
    const agent2 = shuffled[1];

    // Send both to the whiteboard — they'll naturally go to the same one
    this.triggerWhiteboardVisit(agent1.id);
    // Slight delay so they arrive staggered
    setTimeout(() => {
      const ch2 = this.characters.get(agent2.id);
      if (ch2 && !ch2.isActive && !ch2.whiteboardVisit && !ch2.amenityVisit) {
        this.triggerWhiteboardVisit(agent2.id);
        // Show alert bubbles on both when second arrives
        setTimeout(() => {
          this.showReactionBubble(agent1.id, 'alert');
          this.showReactionBubble(agent2.id, 'alert');
        }, 3000);
      }
    }, 1500);
  }

  /** All-idle fun: agents react when everyone is idle for too long */
  /** Launch a paper airplane from one agent to another */
  launchPaperAirplane(fromId: number, toId: number): void {
    const from = this.characters.get(fromId);
    const to = this.characters.get(toId);
    if (!from || !to) return;
    this.paperAirplanes.push({
      fromX: from.x,
      fromY: from.y - 12,
      toX: to.x,
      toY: to.y - 12,
      timer: 0,
      duration: 1.5,
    });
    this.showReactionBubble(fromId, 'idea');
    setTimeout(() => this.showReactionBubble(toId, 'alert'), 1200);
  }

  triggerAllIdleFun(): void {
    const agents: Character[] = [];
    for (const ch of this.characters.values()) {
      if (!ch.isSubagent) agents.push(ch);
    }
    if (agents.length < 2) return;

    // 40% chance paper airplane, 30% whiteboard argument, 30% bubble wave
    const roll = Math.random();
    if (roll < 0.4) {
      // Paper airplane toss!
      const shuffled = agents.sort(() => Math.random() - 0.5);
      this.launchPaperAirplane(shuffled[0].id, shuffled[1].id);
      return;
    }

    // Random fun activity: wave of reaction bubbles across all agents
    const bubbleTypes: Array<'heart' | 'idea' | 'confused' | 'alert'> = [
      'heart',
      'idea',
      'confused',
      'alert',
    ];
    const chosenBubble = bubbleTypes[Math.floor(Math.random() * bubbleTypes.length)];

    // Stagger the bubbles for a wave effect
    agents.forEach((ch, i) => {
      setTimeout(() => {
        if (!ch.isActive) {
          this.showReactionBubble(ch.id, chosenBubble);
        }
      }, i * 300);
    });
  }

  /** Trigger a handoff visit: agent walks to the nearest other agent's desk, pauses, then returns */
  triggerHandoffVisit(closerAgentId: number): void {
    const ch = this.characters.get(closerAgentId);
    if (!ch || !ch.seatId || ch.whiteboardVisit || ch.amenityVisit) return;

    // Find nearest OTHER non-sub-agent that's seated
    let bestTarget: Character | null = null;
    let bestDist = Infinity;
    for (const [, other] of this.characters) {
      if (other.id === closerAgentId || other.isSubagent || !other.seatId) continue;
      if (other.matrixEffect === 'despawn') continue;
      const d = Math.abs(ch.tileCol - other.tileCol) + Math.abs(ch.tileRow - other.tileRow);
      if (d < bestDist) {
        bestDist = d;
        bestTarget = other;
      }
    }
    if (!bestTarget || !bestTarget.seatId) return;

    // Get the target agent's seat
    const targetSeat = this.seats.get(bestTarget.seatId);
    if (!targetSeat) return;

    // Stand one tile below the target's seat (facing up toward them)
    const targetCol = targetSeat.seatCol;
    const targetRow = targetSeat.seatRow + 1;

    // Compute facing direction from walk-to position toward the target agent
    const facingDir = directionToward(targetCol, targetRow, targetSeat.seatCol, targetSeat.seatRow);

    const returnSeatId = ch.seatId;

    ch.amenityVisit = {
      phase: 'walking_to',
      amenityType: 'HANDOFF',
      targetCol,
      targetRow,
      returnSeatId,
      timer: 0,
      facingDir,
    };

    // Release seat so character can walk freely
    const seat = this.seats.get(ch.seatId);
    if (seat) seat.assigned = false;
    ch.seatId = null;

    // Path to target
    const path = this.withOwnSeatUnblocked(ch, () =>
      findPath(ch.tileCol, ch.tileRow, targetCol, targetRow, this.tileMap, this.blockedTiles),
    );
    if (path.length > 0) {
      ch.path = path;
      ch.moveProgress = 0;
      ch.state = CharacterState.WALK;
      ch.frame = 0;
      ch.frameTimer = 0;
    } else {
      // Can't path — abort
      ch.amenityVisit = undefined;
      if (seat) seat.assigned = true;
      ch.seatId = returnSeatId;
    }
  }

  isWhiteboardAt(worldX: number, worldY: number): boolean {
    const col = Math.floor(worldX / TILE_SIZE);
    const row = Math.floor(worldY / TILE_SIZE);
    for (const wb of this.getWhiteboardPositions()) {
      if (col >= wb.col && col < wb.col + wb.width && row >= wb.row && row < wb.row + wb.height) {
        return true;
      }
    }
    return false;
  }

  getCharacters(): Character[] {
    return Array.from(this.characters.values());
  }

  /** Get character at pixel position (for hit testing). Returns id or null. */
  getCharacterAt(worldX: number, worldY: number): number | null {
    const chars = this.getCharacters().sort((a, b) => b.y - a.y);
    for (const ch of chars) {
      // Skip characters that are despawning
      if (ch.matrixEffect === 'despawn') continue;
      // Character sprite is 16x24, anchored bottom-center
      // Apply sitting offset to match visual position
      // Sub-agents are rendered at reduced scale, so shrink hit box accordingly
      const scale = ch.isSubagent ? SUBAGENT_SCALE : 1;
      const sittingOffset = ch.state === CharacterState.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0;
      const anchorY = ch.y + sittingOffset;
      const left = ch.x - CHARACTER_HIT_HALF_WIDTH * scale;
      const right = ch.x + CHARACTER_HIT_HALF_WIDTH * scale;
      const top = anchorY - CHARACTER_HIT_HEIGHT * scale;
      const bottom = anchorY;
      if (worldX >= left && worldX <= right && worldY >= top && worldY <= bottom) {
        return ch.id;
      }
    }
    return null;
  }
}
