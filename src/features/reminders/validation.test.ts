import { describe, expect, it } from "vitest";
import {
  EMPTY_VALUES,
  toCreateInput,
  validateReminderForm,
  type ReminderFormValues,
} from "./validation";

function values(overrides: Partial<ReminderFormValues> = {}): ReminderFormValues {
  return { ...EMPTY_VALUES, title: "Drink water", ...overrides };
}

describe("validateReminderForm", () => {
  it("accepts valid daily, weekly, and once forms", () => {
    expect(validateReminderForm(values())).toEqual({});
    expect(
      validateReminderForm(values({ scheduleType: "weekly", daysOfWeek: [1, 3] })),
    ).toEqual({});
    expect(
      validateReminderForm(
        values({ scheduleType: "once", scheduledTime: "2026-09-21T10:00", daysOfWeek: [] }),
      ),
    ).toEqual({});
  });

  it("rejects empty and overlong titles", () => {
    expect(validateReminderForm(values({ title: "   " })).title).toBeDefined();
    expect(validateReminderForm(values({ title: "x".repeat(201) })).title).toBeDefined();
    expect(validateReminderForm(values({ title: "x".repeat(200) })).title).toBeUndefined();
  });

  it("rejects malformed times", () => {
    expect(validateReminderForm(values({ scheduledTime: "25:00" })).scheduledTime).toBeDefined();
    expect(validateReminderForm(values({ scheduledTime: "9:00" })).scheduledTime).toBeDefined();
    expect(
      validateReminderForm(values({ scheduleType: "once", scheduledTime: "2026-09-21" }))
        .scheduledTime,
    ).toBeDefined();
  });

  it("requires weekly days and bounds them", () => {
    expect(
      validateReminderForm(values({ scheduleType: "weekly", daysOfWeek: [] })).daysOfWeek,
    ).toBeDefined();
    expect(
      validateReminderForm(values({ scheduleType: "weekly", daysOfWeek: [7] })).daysOfWeek,
    ).toBeDefined();
  });

  it("bounds message and tone", () => {
    expect(validateReminderForm(values({ message: "x".repeat(2001) })).message).toBeDefined();
    expect(validateReminderForm(values({ tone: "x".repeat(101) })).tone).toBeDefined();
  });
});

describe("toCreateInput", () => {
  it("trims, nulls empties, sorts days, and drops days for non-weekly", () => {
    const input = toCreateInput(
      values({ title: "  Water  ", message: "   ", daysOfWeek: [5, 1], tone: "" }),
    );
    expect(input.title).toBe("Water");
    expect(input.message).toBeNull();
    expect(input.tone).toBeNull();
    expect(input.daysOfWeek).toBeNull();

    const weekly = toCreateInput(values({ scheduleType: "weekly", daysOfWeek: [5, 1] }));
    expect(weekly.daysOfWeek).toEqual([1, 5]);
  });
});
