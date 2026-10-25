import { describe, expect, it } from "vitest";
import {
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

function target(variants: unknown, stage: string): Record<string, unknown> {
  return (variants as Record<string, Record<string, unknown>>)[stage] ?? {};
}

function delayOf(stage: Record<string, unknown>): number {
  return ((stage["transition"] as Record<string, unknown> | undefined)?.["delay"] as number) ?? 0;
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

describe("staged reveal presets", () => {
  it("background drops alone first (no avatar, no bubble)", () => {
    const initial = target(backgroundDropVariants, "initial");
    expect(initial["opacity"]).toBe(0);
    expect(initial["y"]).toBe(-30);
    expect(initial["scale"]).toBe(0.96);
    expect(delayOf(target(backgroundDropVariants, "animate"))).toBeLessThan(0.1);
  });
  it("avatar rises (not just fades) after the background", () => {
    const initial = target(avatarRiseVariants, "initial");
    expect(initial["opacity"]).toBe(0);
    // Rises from below: nonzero vertical offset (clipped by the panel).
    expect(initial["y"]).not.toBe(0);
    expect(initial["y"]).not.toBe("0%");
    expect(delayOf(target(avatarRiseVariants, "animate"))).toBeGreaterThanOrEqual(0.25);
  });
  it("bubble unfolds from the avatar side last, without scaling text", () => {
    const initial = target(bubbleUnfoldVariants, "initial");
    const animate = target(bubbleUnfoldVariants, "animate");
    expect(initial["clipPath"]).toMatch(/inset\(0 0 0 100%/);
    expect(animate["clipPath"]).toMatch(/inset\(0 0 0% 0/);
    expect(initial).not.toHaveProperty("scaleX");
    expect(animate).not.toHaveProperty("scaleX");
    expect(delayOf(animate)).toBeGreaterThanOrEqual(0.5);
  });
  it("exit reverses the hierarchy: bubble, avatar, background", () => {
    expect(delayOf(target(bubbleUnfoldVariants, "exit"))).toBe(0);
    expect(delayOf(target(avatarRiseVariants, "exit"))).toBeGreaterThan(0);
    expect(delayOf(target(backgroundDropVariants, "exit"))).toBeGreaterThan(
      delayOf(target(avatarRiseVariants, "exit")),
    );
    for (const variants of [bubbleUnfoldVariants, avatarRiseVariants, backgroundDropVariants]) {
      const transition = (target(variants, "exit")["transition"] as Record<string, unknown>) ?? {};
      expect(transition["duration"] as number).toBeLessThanOrEqual(0.25);
    }
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
