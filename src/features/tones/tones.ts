/**
 * Built-in reminder tones (Phase 7).
 *
 * Small, original, synthesized sounds — no audio assets to bundle or license.
 * IDs are persisted (reminder.tone / settings.default_tone); unknown or
 * legacy values always resolve to the fallback, so stored data can never
 * break playback.
 */

export const TONE_IDS = ["soft", "gentle", "bright"] as const;
export type ToneId = (typeof TONE_IDS)[number];

export const FALLBACK_TONE: ToneId = "soft";

export interface ToneNote {
  /** Frequency in Hz. */
  freq: number;
  /** Offset from tone start, in seconds. */
  at: number;
  /** Note length, in seconds. */
  dur: number;
}

export interface ToneDef {
  id: ToneId;
  /** Oscillator shape for the whole tone. */
  shape: OscillatorType;
  /** Peak gain (0–1); envelopes fade in/out to avoid clicks. */
  gain: number;
  notes: ToneNote[];
}

export const TONES: Record<ToneId, ToneDef> = {
  soft: {
    id: "soft",
    shape: "sine",
    gain: 0.14,
    notes: [
      { freq: 660.0, at: 0, dur: 0.28 },
      { freq: 523.25, at: 0.22, dur: 0.45 },
    ],
  },
  gentle: {
    id: "gentle",
    shape: "triangle",
    gain: 0.11,
    notes: [
      { freq: 392.0, at: 0, dur: 0.5 },
      { freq: 523.25, at: 0.35, dur: 0.6 },
    ],
  },
  bright: {
    id: "bright",
    shape: "sine",
    gain: 0.12,
    notes: [
      { freq: 880.0, at: 0, dur: 0.3 },
      { freq: 1318.5, at: 0.05, dur: 0.25 },
    ],
  },
};

export function isToneId(value: unknown): value is ToneId {
  return typeof value === "string" && (TONE_IDS as readonly string[]).includes(value);
}

/**
 * Resolution precedence: reminder-specific tone → default tone → "soft".
 * Never throws, never returns an unknown id.
 */
export function resolveTone(
  reminderTone: string | null | undefined,
  defaultTone: string | null | undefined,
): ToneId {
  if (isToneId(reminderTone?.trim())) {
    return reminderTone.trim() as ToneId;
  }
  if (isToneId(defaultTone?.trim())) {
    return defaultTone.trim() as ToneId;
  }
  return FALLBACK_TONE;
}
