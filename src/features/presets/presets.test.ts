import { describe, expect, it } from "vitest";
import { translate } from "../../lib/i18n";
import { toCreateInput, validateReminderForm } from "../reminders/validation";
import { PRESETS, presetToFormValues } from "./presets";

const t = (key: string): string => translate(key, "en");

describe("preset structure", () => {
  it("ships templates with valid defaults", () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(6);
    const ids = PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const preset of PRESETS) {
      expect(preset.titleKey.length).toBeGreaterThan(0);
      expect(preset.snoozeDuration).toBeGreaterThanOrEqual(0);
      // Every preset must survive backend-equivalent validation once resolved.
      expect(validateReminderForm(presetToFormValues(preset, t))).toEqual({});
    }
  });
});

describe("presetToFormValues", () => {
  it("resolves copy and copies weekday arrays", () => {
    const preset = PRESETS.find((item) => item.id === "call-family")!;
    const form = presetToFormValues(preset, t);
    expect(form.title).toBe("Call Family");
    expect(form.scheduleType).toBe("weekly");
    expect(form.daysOfWeek).toEqual([6]);
    expect(form.daysOfWeek).not.toBe(preset.daysOfWeek);
  });

  it("never mutates the preset definitions", () => {
    const before = JSON.stringify(PRESETS);
    for (const preset of PRESETS) {
      const form = presetToFormValues(preset, t);
      form.title = "changed";
      form.daysOfWeek.push(0);
    }
    expect(JSON.stringify(PRESETS)).toBe(before);
  });

  it("flows preset → edited form → valid backend input", () => {
    for (const preset of PRESETS) {
      const form = presetToFormValues(preset, t);
      // Simulate the user reviewing and tweaking before save.
      const edited = { ...form, title: `${form.title} (today)` };
      const input = toCreateInput(edited);
      expect(validateReminderForm({ ...edited }, "en")).toEqual({});
      expect(input.title).toBe(`${translate(preset.titleKey, "en")} (today)`);
      expect(input.enabled).toBe(true);
    }
  });
});
