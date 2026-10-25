import { describe, expect, it } from "vitest";
import { snoozeOptions, validatePopupPayload } from "./types";

const VALID = {
  id: 3,
  title: "Drink water",
  message: "Two glasses",
  kind: "reminder",
  scheduleType: "daily",
  scheduledTime: "10:00",
  daysOfWeek: null,
  snoozeDuration: 5,
  tone: null,
};

describe("validatePopupPayload", () => {
  it("accepts a well-formed native payload", () => {
    expect(validatePopupPayload(VALID)).toEqual(VALID);
  });

  it.each([
    ["null", null],
    ["non-object", "reminder-due"],
    ["array", []],
    ["zero id", { ...VALID, id: 0 }],
    ["negative id", { ...VALID, id: -2 }],
    ["fractional id", { ...VALID, id: 1.5 }],
    ["empty title", { ...VALID, title: "   " }],
    ["non-string title", { ...VALID, title: 42 }],
    ["non-string message", { ...VALID, message: 7 }],
    ["missing kind", { ...VALID, kind: undefined }],
    ["missing scheduledTime", { ...VALID, scheduledTime: undefined }],
    ["non-array days", { ...VALID, daysOfWeek: "mon" }],
    ["non-string tone", { ...VALID, tone: 3 }],
    ["missing snooze duration", { ...VALID, snoozeDuration: undefined }],
  ])("rejects %s", (_label, value) => {
    expect(validatePopupPayload(value)).toBeNull();
  });

  it("trims titles and accepts null message", () => {
    const parsed = validatePopupPayload({ ...VALID, title: "  Water  ", message: null });
    expect(parsed?.title).toBe("Water");
    expect(parsed?.message).toBeNull();
  });
});

describe("snoozeOptions", () => {
  const PRESETS = [5, 10, 15, 30, 60];
  it("puts the reminder's own length first", () => {
    expect(snoozeOptions(20, PRESETS)).toEqual([20, 5, 10, 15, 30, 60]);
  });
  it("does not duplicate a length that is already a preset", () => {
    expect(snoozeOptions(10, PRESETS)).toEqual([10, 5, 15, 30, 60]);
  });
  it("ignores zero or out-of-range lengths", () => {
    expect(snoozeOptions(0, PRESETS)).toEqual(PRESETS);
    expect(snoozeOptions(999, PRESETS)).toEqual(PRESETS);
  });
});
