import { TONES, type ToneId } from "./tones";

let sharedContext: AudioContext | null = null;

function context(): AudioContext | null {
  try {
    if (sharedContext === null) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor === undefined) {
        return null;
      }
      sharedContext = new Ctor();
    }
    return sharedContext;
  } catch {
    return null;
  }
}

/**
 * Plays a built-in tone through Web Audio. Presentation-layer only: never
 * throws, never blocks — audio failure (missing backend, suspended autoplay)
 * resolves silently so the popup always appears.
 */
export async function playTone(id: ToneId): Promise<void> {
  try {
    const ctx = context();
    if (ctx === null) {
      return;
    }
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    if (ctx.state !== "running") {
      return;
    }
    const def = TONES[id];
    const startAt = ctx.currentTime + 0.02;
    for (const note of def.notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = def.shape;
      osc.frequency.value = note.freq;
      const on = startAt + note.at;
      gain.gain.setValueAtTime(0.0001, on);
      gain.gain.exponentialRampToValueAtTime(def.gain, on + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, on + note.dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(on);
      osc.stop(on + note.dur + 0.05);
    }
  } catch {
    // Audio is best-effort by design.
  }
}
