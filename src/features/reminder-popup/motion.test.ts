import { describe, expect, it } from "vitest";
import {
  AVATAR_PEEK_DELAY_S,
  CARD_REVEAL_DELAY_S,
  COLLAPSE_MANUAL_S,
  NOTCH_EXPAND_S,
  NOTCH_IDLE_S,
  NOTCH_SPRING_EASE,
  type DismissKind,
  avatarHover,
  avatarRiseVariants,
  backgroundDropVariants,
  bubbleUnfoldVariants,
  flatExit,
  POPUP_AUTO_DISMISS_MS,
  POPUP_EXIT_DELAY_MS,
  POPUP_EXIT_DELAY_REDUCED_MS,
  resolveMotion,
  resolvePopupDismissMs,
} from "./motion";

function target(variants: unknown, stage: string, kind: DismissKind = "auto"): Record<string, unknown> {
  const value = (variants as Record<string, unknown>)[stage];
  const resolved = typeof value === "function" ? (value as (k: DismissKind) => unknown)(kind) : value;
  return (resolved as Record<string, unknown> | undefined) ?? {};
}


/** Delay/duration of the main (non-opacity) transition of a stage. */
function mainOf(stage: Record<string, unknown>): { delay: number; duration: number } {
  const t = (stage["transition"] as Record<string, unknown> | undefined) ?? {};
  const main = (t["default"] as Record<string, number> | undefined) ?? (t as Record<string, number>);
  return { delay: main["delay"] ?? 0, duration: main["duration"] ?? 0 };
}

describe("resolveMotion", () => {
  it("prefers the app setting, falls back to the OS", () => {
    expect(resolveMotion(true, false)).toBe("always");
    expect(resolveMotion(false, true)).toBe("never");
    expect(resolveMotion(null, true)).toBe("always");
    expect(resolveMotion(null, false)).toBe("never");
  });

  it("keeps exit delays short and ordered", () => {
    expect(POPUP_EXIT_DELAY_REDUCED_MS).toBeLessThan(POPUP_EXIT_DELAY_MS);
    expect(POPUP_EXIT_DELAY_MS).toBeLessThanOrEqual(250);
  });
});

describe("resolvePopupDismissMs", () => {
  it("uses the persisted duration in milliseconds", () => {
    expect(resolvePopupDismissMs(30)).toBe(30_000);
    expect(resolvePopupDismissMs(5)).toBe(5_000);
  });
  it("falls back when settings are unknown", () => {
    expect(resolvePopupDismissMs(null)).toBe(POPUP_AUTO_DISMISS_MS);
    expect(resolvePopupDismissMs(undefined)).toBe(POPUP_AUTO_DISMISS_MS);
    expect(resolvePopupDismissMs(Number.NaN)).toBe(POPUP_AUTO_DISMISS_MS);
  });
  it("clamps corrupt values into the safe range", () => {
    expect(resolvePopupDismissMs(0)).toBe(5_000);
    expect(resolvePopupDismissMs(-20)).toBe(5_000);
    expect(resolvePopupDismissMs(3600)).toBe(600_000);
  });
});

describe("notch reveal presets", () => {
  it("notch starts small, idles, then expands with the springy ease", () => {
    const initial = target(backgroundDropVariants, "initial");
    expect(initial["scaleY"] as number).toBeLessThan(0.3);
    expect(initial["scaleX"] as number).toBeLessThan(1);
    const { delay, duration } = mainOf(target(backgroundDropVariants, "animate"));
    expect(delay).toBe(NOTCH_IDLE_S);
    expect(duration).toBe(NOTCH_EXPAND_S);
    expect(NOTCH_SPRING_EASE).toEqual([0.34, 1.56, 0.64, 1]);
  });
  it("avatar slides up from inside the notch after it has expanded", () => {
    const initial = target(avatarRiseVariants, "initial");
    expect(initial["opacity"]).toBe(0);
    expect(initial["y"]).not.toBe(0);
    expect(initial["y"]).not.toBe("0%");
    expect(mainOf(target(avatarRiseVariants, "animate")).delay).toBe(AVATAR_PEEK_DELAY_S);
    expect(AVATAR_PEEK_DELAY_S).toBeGreaterThan(NOTCH_IDLE_S);
  });
  it("card text fades and slides in last (opacity + translateY only)", () => {
    const initial = target(bubbleUnfoldVariants, "initial");
    const animate = target(bubbleUnfoldVariants, "animate");
    expect(initial["opacity"]).toBe(0);
    expect(initial["y"]).toBe(8);
    expect(animate["opacity"]).toBe(1);
    expect(animate["y"]).toBe(0);
    for (const stage of [initial, animate]) {
      expect(stage).not.toHaveProperty("clipPath");
      expect(stage).not.toHaveProperty("scaleX");
    }
    const { delay, duration } = mainOf(animate);
    expect(delay).toBe(CARD_REVEAL_DELAY_S);
    expect(delay).toBeGreaterThan(AVATAR_PEEK_DELAY_S);
    expect(duration).toBeCloseTo(0.35, 5);
  });
  it("timed exit reverses the hierarchy: card, avatar, notch", () => {
    const delayOf = (v: unknown): number => mainOf(target(v, "exit", "auto")).delay;
    expect(delayOf(bubbleUnfoldVariants)).toBe(0);
    expect(delayOf(avatarRiseVariants)).toBeGreaterThan(0);
    expect(delayOf(backgroundDropVariants)).toBeGreaterThan(delayOf(avatarRiseVariants));
    for (const variants of [bubbleUnfoldVariants, avatarRiseVariants, backgroundDropVariants]) {
      expect(mainOf(target(variants, "exit", "auto")).duration).toBeLessThanOrEqual(0.25);
    }
  });
  it("manual dismiss collapses every layer at once in ~200ms", () => {
    for (const variants of [bubbleUnfoldVariants, avatarRiseVariants, backgroundDropVariants]) {
      const exit = target(variants, "exit", "manual");
      expect(exit["opacity"]).toBe(0);
      expect(mainOf(exit)).toEqual({ delay: 0, duration: COLLAPSE_MANUAL_S });
    }
    expect(COLLAPSE_MANUAL_S).toBeCloseTo(0.2, 5);
    expect(target(bubbleUnfoldVariants, "exit", "manual")["scale"] as number).toBeLessThan(1);
  });
  it("reduced-motion exit is a plain quick fade", () => {
    expect(flatExit["opacity"]).toBe(0);
    expect(
      ((flatExit["transition"] as Record<string, unknown>)?.["duration"] as number),
    ).toBeLessThanOrEqual(0.15);
  });
  it("avatar hover stays subtle and premium", () => {
    expect(avatarHover.scale).toBeGreaterThanOrEqual(1.03);
    expect(avatarHover.scale).toBeLessThanOrEqual(1.06);
    expect(avatarHover.y).toBeGreaterThanOrEqual(-5);
    expect(avatarHover.y).toBeLessThan(0);
    expect(Math.abs(avatarHover.rotate)).toBeLessThanOrEqual(2);
  });
});
