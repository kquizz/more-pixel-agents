import {
  FOOTSTEP_DURATION_SEC,
  FOOTSTEP_FREQ,
  FOOTSTEP_INTERVAL_SEC,
  FOOTSTEP_VOLUME,
  IDLE_NOTE_DURATION_SEC,
  IDLE_NOTE_HZ,
  IDLE_VOLUME,
  MAX_AMBIENT_SOUNDS,
  NOTIFICATION_NOTE_1_HZ,
  NOTIFICATION_NOTE_1_START_SEC,
  NOTIFICATION_NOTE_2_HZ,
  NOTIFICATION_NOTE_2_START_SEC,
  NOTIFICATION_NOTE_DURATION_SEC,
  NOTIFICATION_VOLUME,
  TASK_COMPLETE_NOTE_1_HZ,
  TASK_COMPLETE_NOTE_1_START_SEC,
  TASK_COMPLETE_NOTE_2_HZ,
  TASK_COMPLETE_NOTE_2_START_SEC,
  TASK_COMPLETE_NOTE_DURATION_SEC,
  TASK_COMPLETE_VOLUME,
  TYPING_CLICK_DURATION_SEC,
  TYPING_CLICK_FREQ_MAX,
  TYPING_CLICK_FREQ_MIN,
  TYPING_CLICK_INTERVAL_SEC,
  TYPING_CLICK_VOLUME,
} from './constants.js';

let soundEnabled = false;
let audioCtx: AudioContext | null = null;

export function setSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled;
}

export function isSoundEnabled(): boolean {
  return soundEnabled;
}

function playNote(ctx: AudioContext, freq: number, startOffset: number): void {
  const t = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, t);

  gain.gain.setValueAtTime(NOTIFICATION_VOLUME, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + NOTIFICATION_NOTE_DURATION_SEC);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(t);
  osc.stop(t + NOTIFICATION_NOTE_DURATION_SEC);
}

function playNoteWithParams(
  ctx: AudioContext,
  freq: number,
  startOffset: number,
  duration: number,
  volume: number,
): void {
  const t = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, t);

  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(t);
  osc.stop(t + duration);
}

export async function playDoneSound(): Promise<void> {
  if (!soundEnabled) return;
  try {
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }
    // Resume suspended context (webviews suspend until user gesture)
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    // Ascending two-note chime: E5 → B5
    playNote(audioCtx, NOTIFICATION_NOTE_1_HZ, NOTIFICATION_NOTE_1_START_SEC);
    playNote(audioCtx, NOTIFICATION_NOTE_2_HZ, NOTIFICATION_NOTE_2_START_SEC);
  } catch {
    // Audio may not be available
  }
}

export async function playTaskCompleteSound(): Promise<void> {
  if (!soundEnabled) return;
  try {
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    // Descending two-note ding: C6 → G5
    playNoteWithParams(
      audioCtx,
      TASK_COMPLETE_NOTE_1_HZ,
      TASK_COMPLETE_NOTE_1_START_SEC,
      TASK_COMPLETE_NOTE_DURATION_SEC,
      TASK_COMPLETE_VOLUME,
    );
    playNoteWithParams(
      audioCtx,
      TASK_COMPLETE_NOTE_2_HZ,
      TASK_COMPLETE_NOTE_2_START_SEC,
      TASK_COMPLETE_NOTE_DURATION_SEC,
      TASK_COMPLETE_VOLUME,
    );
  } catch {
    // Audio may not be available
  }
}

export async function playIdleSound(): Promise<void> {
  if (!soundEnabled) return;
  try {
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    // Single low subtle tone: C4
    playNoteWithParams(audioCtx, IDLE_NOTE_HZ, 0, IDLE_NOTE_DURATION_SEC, IDLE_VOLUME);
  } catch {
    // Audio may not be available
  }
}

/** Call from any user-gesture handler to ensure AudioContext is unlocked */
export function unlockAudio(): void {
  try {
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  } catch {
    // ignore
  }
}

// ── Ambient Sounds ──────────────────────────────────────────

let typingTimer = 0;
let footstepTimer = 0;

/** Tick ambient typing clicks and footstep sounds based on active character counts */
export function tickAmbientSounds(dt: number, typingCount: number, walkingCount: number): void {
  if (!soundEnabled || !audioCtx) return;
  if (audioCtx.state === 'suspended') return; // don't try to resume here, too frequent

  // Typing clicks
  if (typingCount > 0) {
    typingTimer += dt;
    if (typingTimer >= TYPING_CLICK_INTERVAL_SEC) {
      typingTimer -= TYPING_CLICK_INTERVAL_SEC;
      // Vary frequency for natural feel
      const freq =
        TYPING_CLICK_FREQ_MIN + Math.random() * (TYPING_CLICK_FREQ_MAX - TYPING_CLICK_FREQ_MIN);
      // Volume scales with number of typers (capped)
      const vol = TYPING_CLICK_VOLUME * Math.min(typingCount, MAX_AMBIENT_SOUNDS);
      playClickSound(audioCtx, freq, vol);
    }
  } else {
    typingTimer = 0;
  }

  // Footstep sounds
  if (walkingCount > 0) {
    footstepTimer += dt;
    if (footstepTimer >= FOOTSTEP_INTERVAL_SEC) {
      footstepTimer -= FOOTSTEP_INTERVAL_SEC;
      const vol = FOOTSTEP_VOLUME * Math.min(walkingCount, MAX_AMBIENT_SOUNDS);
      playClickSound(audioCtx, FOOTSTEP_FREQ + Math.random() * 30, vol);
    }
  } else {
    footstepTimer = 0;
  }
}

function playClickSound(ctx: AudioContext, freq: number, volume: number): void {
  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Use 'square' wave for clicky sound, 'sine' for soft thud
    osc.type = freq > 1000 ? 'square' : 'sine';
    osc.frequency.setValueAtTime(freq, t);

    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      t + (freq > 1000 ? TYPING_CLICK_DURATION_SEC : FOOTSTEP_DURATION_SEC),
    );

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.05);
  } catch {
    // Audio errors are non-critical
  }
}
