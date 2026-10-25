import { describe, expect, it } from "vitest";
import { validatePopupPayload } from "./types";

const VALID = {
  id: 3,
  title: "Drink water",
  message: "Two glasses",
  kind: "reminder",
  scheduleType: "daily",
  scheduledTime: "10:00",
  daysOfWeek: null,
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
  ])("rejects %s", (_label, value) => {
    expect(validatePopupPayload(value)).toBeNull();
  });

  it("trims titles and accepts null message", () => {
    const parsed = validatePopupPayload({ ...VALID, title: "  Water  ", message: null });
    expect(parsed?.title).toBe("Water");
    expect(parsed?.message).toBeNull();
  });
});
