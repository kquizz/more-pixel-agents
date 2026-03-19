import type { FloorColor } from './office/types.js';

// ── Grid & Layout ────────────────────────────────────────────
export const TILE_SIZE = 16;
export const DEFAULT_COLS = 20;
export const DEFAULT_ROWS = 11;
export const MAX_COLS = 64;
export const MAX_ROWS = 64;

// ── Character Animation ─────────────────────────────────────
export const WALK_SPEED_PX_PER_SEC = 48;
export const WALK_FRAME_DURATION_SEC = 0.15;
export const TYPE_FRAME_DURATION_SEC = 0.3;
export const WANDER_PAUSE_MIN_SEC = 2.0;
export const WANDER_PAUSE_MAX_SEC = 20.0;
export const WANDER_MOVES_BEFORE_REST_MIN = 3;
export const WANDER_MOVES_BEFORE_REST_MAX = 6;
export const SEAT_REST_MIN_SEC = 120.0;
export const SEAT_REST_MAX_SEC = 240.0;

// ── Greeting Animation ──────────────────────────────────────
export const GREETING_DURATION_SEC = 1.0;
export const GREETING_PARENT_EXTRA_SEC = 0.3;

// ── Matrix Effect ────────────────────────────────────────────
export const MATRIX_EFFECT_DURATION_SEC = 0.3;
export const MATRIX_TRAIL_LENGTH = 6;
export const MATRIX_SPRITE_COLS = 16;
export const MATRIX_SPRITE_ROWS = 24;
export const MATRIX_FLICKER_FPS = 30;
export const MATRIX_FLICKER_VISIBILITY_THRESHOLD = 180;
export const MATRIX_COLUMN_STAGGER_RANGE = 0.3;
export const MATRIX_HEAD_COLOR = '#ccffcc';
export const MATRIX_TRAIL_OVERLAY_ALPHA = 0.6;
export const MATRIX_TRAIL_EMPTY_ALPHA = 0.5;
export const MATRIX_TRAIL_MID_THRESHOLD = 0.33;
export const MATRIX_TRAIL_DIM_THRESHOLD = 0.66;

// ── Rendering ────────────────────────────────────────────────
export const CHARACTER_SITTING_OFFSET_PX = 10;
export const CHARACTER_SITTING_OFFSET_SIDE_PX = 6;
export const CHARACTER_Z_SORT_OFFSET = 0.5;
export const OUTLINE_Z_SORT_OFFSET = 0.001;
export const SELECTED_OUTLINE_ALPHA = 1.0;
export const HOVERED_OUTLINE_ALPHA = 0.5;
export const GHOST_PREVIEW_SPRITE_ALPHA = 0.5;
export const GHOST_PREVIEW_TINT_ALPHA = 0.25;
export const SELECTION_DASH_PATTERN: [number, number] = [4, 3];
export const BUTTON_MIN_RADIUS = 6;
export const BUTTON_RADIUS_ZOOM_FACTOR = 3;
export const BUTTON_ICON_SIZE_FACTOR = 0.45;
export const BUTTON_LINE_WIDTH_MIN = 1.5;
export const BUTTON_LINE_WIDTH_ZOOM_FACTOR = 0.5;
export const BUBBLE_FADE_DURATION_SEC = 0.5;
export const BUBBLE_SITTING_OFFSET_PX = 10;
export const BUBBLE_VERTICAL_OFFSET_PX = 24;
export const FALLBACK_FLOOR_COLOR = '#808080';

// ── Rendering - Overlay Colors (canvas, not CSS) ─────────────
export const SEAT_OWN_COLOR = 'rgba(0, 127, 212, 0.35)';
export const SEAT_AVAILABLE_COLOR = 'rgba(0, 200, 80, 0.35)';
export const SEAT_BUSY_COLOR = 'rgba(220, 50, 50, 0.35)';
export const GRID_LINE_COLOR = 'rgba(255,255,255,0.12)';
export const VOID_TILE_OUTLINE_COLOR = 'rgba(255,255,255,0.08)';
export const VOID_TILE_DASH_PATTERN: [number, number] = [2, 2];
export const GHOST_BORDER_HOVER_FILL = 'rgba(60, 130, 220, 0.25)';
export const GHOST_BORDER_HOVER_STROKE = 'rgba(60, 130, 220, 0.5)';
export const GHOST_BORDER_STROKE = 'rgba(255, 255, 255, 0.06)';
export const GHOST_VALID_TINT = '#00ff00';
export const GHOST_INVALID_TINT = '#ff0000';
export const SELECTION_HIGHLIGHT_COLOR = '#007fd4';
export const DELETE_BUTTON_BG = 'rgba(200, 50, 50, 0.85)';
export const ROTATE_BUTTON_BG = 'rgba(50, 120, 200, 0.85)';

// ── Camera ───────────────────────────────────────────────────
export const CAMERA_FOLLOW_LERP = 0.1;
export const CAMERA_FOLLOW_SNAP_THRESHOLD = 0.5;

// ── Zoom ─────────────────────────────────────────────────────
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 10;
export const ZOOM_DEFAULT_DPR_FACTOR = 2;
export const ZOOM_LEVEL_FADE_DELAY_MS = 1500;
export const ZOOM_LEVEL_HIDE_DELAY_MS = 2000;
export const ZOOM_LEVEL_FADE_DURATION_SEC = 0.5;
export const ZOOM_SCROLL_THRESHOLD = 50;
export const PAN_MARGIN_FRACTION = 0.25;

// ── Editor ───────────────────────────────────────────────────
export const UNDO_STACK_MAX_SIZE = 50;
export const LAYOUT_SAVE_DEBOUNCE_MS = 500;
export const DEFAULT_FLOOR_COLOR: FloorColor = { h: 35, s: 30, b: 15, c: 0 };
export const DEFAULT_WALL_COLOR: FloorColor = { h: 240, s: 25, b: 0, c: 0 };
export const DEFAULT_NEUTRAL_COLOR: FloorColor = { h: 0, s: 0, b: 0, c: 0 };

// ── Notification Sound — Waiting Chime ──────────────────────
export const NOTIFICATION_NOTE_1_HZ = 659.25; // E5
export const NOTIFICATION_NOTE_2_HZ = 1318.51; // E6 (octave up)
export const NOTIFICATION_NOTE_1_START_SEC = 0;
export const NOTIFICATION_NOTE_2_START_SEC = 0.1;
export const NOTIFICATION_NOTE_DURATION_SEC = 0.18;
export const NOTIFICATION_VOLUME = 0.14;

// ── Notification Sound — Task Completion ────────────────────
export const TASK_COMPLETE_NOTE_1_HZ = 1046.5; // C6
export const TASK_COMPLETE_NOTE_2_HZ = 783.99; // G5 (descending)
export const TASK_COMPLETE_NOTE_1_START_SEC = 0;
export const TASK_COMPLETE_NOTE_2_START_SEC = 0.12;
export const TASK_COMPLETE_NOTE_DURATION_SEC = 0.25;
export const TASK_COMPLETE_VOLUME = 0.16;

// ── Notification Sound — Idle ───────────────────────────────
export const IDLE_NOTE_HZ = 261.63; // C4
export const IDLE_NOTE_DURATION_SEC = 0.12;
export const IDLE_VOLUME = 0.08;

// ── Furniture Animation ─────────────────────────────────────
export const FURNITURE_ANIM_INTERVAL_SEC = 0.2;
export const AMBIENT_ANIM_INTERVAL_SEC = 1.0;

// ── Game Logic ───────────────────────────────────────────────
export const MAX_DELTA_TIME_SEC = 0.1;
export const WAITING_BUBBLE_DURATION_SEC = 2.0;
export const REACTION_BUBBLE_DURATION_SEC = 3.0;
export const DISMISS_BUBBLE_FAST_FADE_SEC = 0.3;
export const SLEEP_IDLE_THRESHOLD_SEC = 120;
export const PERMISSION_IMPATIENT_SEC = 15;
export const PERMISSION_SWEAT_INTERVAL_SEC = 10;
export const LONG_TURN_THRESHOLD_SEC = 60;
export const CELEBRATION_CHANCE = 0.5;
export const INACTIVE_SEAT_TIMER_MIN_SEC = 3.0;
export const INACTIVE_SEAT_TIMER_RANGE_SEC = 2.0;
export const PALETTE_COUNT = 6;
export const HUE_SHIFT_MIN_DEG = 45;
export const HUE_SHIFT_RANGE_DEG = 271;
export const AUTO_ON_FACING_DEPTH = 3;
export const AUTO_ON_SIDE_DEPTH = 2;
export const CHARACTER_HIT_HALF_WIDTH = 8;
export const CHARACTER_HIT_HEIGHT = 24;

// ── Amenity Furniture ───────────────────────────────────────
export const AMENITY_FURNITURE_TYPES = [
  'WATER_COOLER',
  'COFFEE_MACHINE',
  'WHITEBOARD',
  'SNACK_MACHINE',
  'ARCADE_CABINET',
  'PRINTER',
] as const;
export const PRINTER_BEATDOWN_CHANCE = 0.08;
export const PRINTER_BEATDOWN_DURATION_SEC = 3.0;
export const SCREEN_SHAKE_DURATION_SEC = 0.4;
export const SCREEN_SHAKE_INTENSITY = 3;
export const AMENITY_VISIT_USE_SEC = 4.0;
export const HANDOFF_VISIT_USE_SEC = 1.5;
export const AMENITY_VISIT_CHANCE = 0.15; // chance per wander cycle to visit an amenity
export const AMENITY_IDLE_MIN_SEC = 30.0; // minimum idle time at desk before considering amenity visit
export const DESK_VISIT_USE_SEC = 2.5; // stand at colleague's desk for 2.5 seconds
export const DESK_VISIT_CHANCE = 0.03; // much lower than amenity visits

// ── Whiteboard Argument ─────────────────────────────────────
export const WHITEBOARD_ARGUMENT_CHANCE = 0.01; // rare event
export const WHITEBOARD_ARGUMENT_TURNS = 4; // each agent writes 2 turns
export const WHITEBOARD_ARGUMENT_WRITE_SEC = 1.5; // writing per turn
export const WHITEBOARD_ARGUMENT_PAUSE_SEC = 0.8; // pause between turns

// ── Rubber Duck Debugging ───────────────────────────────────
export const RUBBER_DUCK_CHANCE = 0.02; // per idle wander cycle
export const RUBBER_DUCK_STARE_SEC = 2.0;

// ── All-Idle Fun ────────────────────────────────────────────
export const ALL_IDLE_THRESHOLD_SEC = 45;
export const ALL_IDLE_FUN_COOLDOWN_SEC = 120;

// ── Tooltip ─────────────────────────────────────────────────
export const TOOLTIP_FONT_SCALE = 2.5;
export const TOOLTIP_PADDING_SCALE = 1;
export const TOOLTIP_BG_COLOR = '#1e1e2eee';
export const TOOLTIP_BORDER_COLOR = '#585b70';
export const TOOLTIP_TEXT_COLOR = '#cdd6f4';
export const TOOLTIP_LINE_HEIGHT_EXTRA = 2;
export const TOOLTIP_BELOW_CHARACTER_TILES = 4;
export const TOOLTIP_MIN_FONT_SIZE = 8;

// ── Sub-agent rendering ─────────────────────────────────────
export const SUBAGENT_SCALE = 0.6;
export const MAX_SUBAGENTS_PER_PARENT = 4;
export const TOOL_OVERLAY_VERTICAL_OFFSET = 32;
export const PULSE_ANIMATION_DURATION_SEC = 1.5;

// ── Tool Bubbles ─────────────────────────────────────────────
export const TOOL_BUBBLE_FONT_SCALE = 2;
export const TOOL_BUBBLE_VERTICAL_OFFSET = 26; // pixels above character
export const TOOL_BUBBLE_MAX_LABEL_LENGTH = 8;
export const TOOL_BUBBLE_MIN_FONT_SIZE = 6;
export const TOOL_BUBBLE_PADDING_SCALE = 0.5;
export const TOOL_BUBBLE_MIN_PADDING = 2;
export const TOOL_BUBBLE_BG_COLOR = '#1e1e2ecc';
export const TOOL_BUBBLE_BORDER_COLOR = '#585b70';
export const TOOL_BUBBLE_TEXT_COLOR = '#89b4fa';

// ── Day/Night Cycle ─────────────────────────────────────────
export const NIGHT_OVERLAY_MAX_ALPHA = 0.15;
export const SUNRISE_START_HOUR = 6;
export const SUNRISE_END_HOUR = 8;
export const SUNSET_START_HOUR = 18;
export const SUNSET_END_HOUR = 21;
export const NIGHT_OVERLAY_COLOR = 'rgba(10, 15, 40,';

// ── Ambient Sounds ──────────────────────────────────────────
export const TYPING_CLICK_INTERVAL_SEC = 0.15; // time between clicks
export const TYPING_CLICK_FREQ_MIN = 3000; // Hz range for click variation
export const TYPING_CLICK_FREQ_MAX = 5000;
export const TYPING_CLICK_DURATION_SEC = 0.015; // very short click
export const TYPING_CLICK_VOLUME = 0.02; // very quiet
export const FOOTSTEP_INTERVAL_SEC = 0.25; // time between steps
export const FOOTSTEP_FREQ = 150; // low thud
export const FOOTSTEP_DURATION_SEC = 0.04;
export const FOOTSTEP_VOLUME = 0.015; // barely audible
export const MAX_AMBIENT_SOUNDS = 3; // max simultaneous typing/walking sources
