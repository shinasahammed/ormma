import { describe, expect, it } from "vitest";
import { playTone } from "./audio";
import { FALLBACK_TONE, isToneId, resolveTone, TONE_IDS, TONES } from "./tones";

describe("isToneId", () => {
  it("accepts exactly the shipped ids", () => {
    expect(TONE_IDS).toEqual(["soft", "gentle", "bright"]);
    for (const id of TONE_IDS) {
      expect(isToneId(id)).toBe(true);
    }
    expect(isToneId("Soft")).toBe(false);
    expect(isToneId("default")).toBe(false);
    expect(isToneId("")).toBe(false);
    expect(isToneId(null)).toBe(false);
  });
});

describe("resolveTone", () => {
  it("prefers reminder tone, then default, then fallback", () => {
    expect(resolveTone("bright", "soft")).toBe("bright");
    expect(resolveTone(null, "gentle")).toBe("gentle");
    expect(resolveTone("", "gentle")).toBe("gentle");
    expect(resolveTone("nope", "also-nope")).toBe(FALLBACK_TONE);
    expect(resolveTone(null, null)).toBe(FALLBACK_TONE);
    // Legacy stored value predates playable ids.
    expect(resolveTone(null, "default")).toBe(FALLBACK_TONE);
  });

  it("every shipped tone has a playable definition", () => {
    for (const id of TONE_IDS) {
      const def = TONES[id];
      expect(def.notes.length).toBeGreaterThan(0);
      expect(def.gain).toBeGreaterThan(0);
      for (const note of def.notes) {
        expect(note.freq).toBeGreaterThan(0);
        expect(note.dur).toBeGreaterThan(0);
      }
    }
  });

  it("resolution never mutates the tone definitions", () => {
    const before = JSON.stringify(TONES);
    for (const reminder of ["soft", "gentle", "bright", "nope", null, ""]) {
      for (const fallback of ["soft", "bad", null]) {
        resolveTone(reminder, fallback);
      }
    }
    expect(JSON.stringify(TONES)).toBe(before);
  });

  it("playback degrades gracefully without an audio backend", async () => {
    // Headless Node has no AudioContext: the contract is silent resolution,
    // never a throw — the popup must always appear.
    await expect(playTone("soft")).resolves.toBeUndefined();
    await expect(playTone("gentle")).resolves.toBeUndefined();
  });
});
