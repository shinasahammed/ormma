import { describe, expect, it } from "vitest";
import {
  AVAILABLE_LOCALES,
  normalizeLocale,
  translate,
  DEFAULT_LOCALE,
} from "./index";

describe("translate", () => {
  it("resolves existing keys", () => {
    expect(translate("nav.home", "en")).toBe("Home");
  });

  it("falls back to English for unknown languages", () => {
    expect(translate("nav.home", "fr")).toBe("Home");
    expect(translate("nav.home", null)).toBe("Home");
    expect(translate("nav.home", "")).toBe("Home");
  });

  it("never renders undefined or blank for missing keys", () => {
    expect(translate("does.not.exist", "en")).toBe("does.not.exist");
    expect(translate("does.not.exist", "xx")).toBe("does.not.exist");
  });

  it("interpolates values", () => {
    expect(translate("reminders.subtitleActive", "en", { active: 2, total: 5 })).toBe(
      "2 of 5 active",
    );
    expect(translate("popup.more", "en", { count: 3 })).toBe("+3 more");
  });
});

describe("normalizeLocale", () => {
  it.each([
    ["en", "en"],
    ["EN", "en"],
    ["en-US", "en"],
    ["en_US", "en"],
    ["fr", DEFAULT_LOCALE],
    ["", DEFAULT_LOCALE],
    [null, DEFAULT_LOCALE],
    [undefined, DEFAULT_LOCALE],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeLocale(input)).toBe(expected);
  });

  it("only ships locales that exist", () => {
    expect(AVAILABLE_LOCALES).toEqual(["en"]);
  });

  it("leaves unmapped placeholders intact instead of blanking", () => {
    expect(translate("reminders.subtitleActive", "en", { active: 1 })).toBe(
      "1 of {total} active",
    );
    expect(translate("reminders.subtitleActive", "en")).toBe("{active} of {total} active");
  });

  it("resolves every key the popup and shell depend on", () => {
    const keys = [
      "nav.primary",
      "nav.home",
      "nav.reminders",
      "nav.settings",
      "status.active",
      "status.paused",
      "status.resume",
      "banner.dismiss",
      "popup.greeting",
      "popup.dismiss",
      "popup.done",
      "popup.kindReminder",
      "form.cancel",
      "settings.save",
      "tone.soft",
      "tone.gentle",
      "tone.bright",
    ];
    for (const key of keys) {
      const value = translate(key, "en");
      expect(value).not.toBe(key);
      expect(value.trim().length).toBeGreaterThan(0);
    }
  });
});
