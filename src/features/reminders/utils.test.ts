import { describe, expect, it } from "vitest";
import {
  byScheduledTime,
  describeSchedule,
  greetingForHour,
  isReminderToday,
  timeOfDay,
  todaysReminders,
} from "./utils";
import type { Reminder } from "./types";

function reminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: 1,
    title: "Drink water",
    message: null,
    kind: "reminder",
    enabled: true,
    scheduleType: "daily",
    scheduledTime: "10:00",
    daysOfWeek: null,
    tone: null,
    createdAt: 0,
    updatedAt: 0,
    lastTriggeredAt: null,
    ...overrides,
  };
}

// Monday 2026-09-21, local time.
const MONDAY_9AM = new Date(2026, 8, 21, 9, 0, 0);

describe("greetingForHour", () => {
  it.each([
    [0, "Good night"],
    [4, "Good night"],
    [5, "Good morning"],
    [11, "Good morning"],
    [12, "Good afternoon"],
    [17, "Good afternoon"],
    [18, "Good evening"],
    [23, "Good evening"],
  ])("hour %i -> %s", (hour, expected) => {
    expect(greetingForHour(hour)).toBe(expected);
  });
});

describe("describeSchedule", () => {
  it("daily", () => {
    expect(describeSchedule(reminder())).toBe("Every day · 10:00");
  });
  it("weekly", () => {
    const r = reminder({ scheduleType: "weekly", daysOfWeek: [5, 1, 3] });
    expect(describeSchedule(r)).toBe("Mon · Wed · Fri · 10:00");
  });
  it("once", () => {
    const r = reminder({ scheduleType: "once", scheduledTime: "2026-09-21T10:00" });
    expect(describeSchedule(r)).toBe("2026-09-21 · 10:00");
  });
});

describe("isReminderToday", () => {
  it("daily fires when enabled only", () => {
    expect(isReminderToday(reminder(), MONDAY_9AM)).toBe(true);
    expect(isReminderToday(reminder({ enabled: false }), MONDAY_9AM)).toBe(false);
  });
  it("weekly matches configured weekdays", () => {
    const r = reminder({ scheduleType: "weekly", daysOfWeek: [1, 3, 5] });
    expect(isReminderToday(r, MONDAY_9AM)).toBe(true);
    expect(isReminderToday(r, new Date(2026, 8, 22, 9, 0, 0))).toBe(false); // Tuesday
  });
  it("once matches its calendar day", () => {
    const r = reminder({ scheduleType: "once", scheduledTime: "2026-09-21T10:00" });
    expect(isReminderToday(r, MONDAY_9AM)).toBe(true);
    expect(isReminderToday(r, new Date(2026, 8, 22, 9, 0, 0))).toBe(false);
  });
});

describe("todaysReminders", () => {
  it("filters and orders by time", () => {
    const list = [
      reminder({ id: 1, scheduledTime: "14:00" }),
      reminder({ id: 2, enabled: false }),
      reminder({ id: 3, scheduleType: "once", scheduledTime: "2026-09-22T08:00" }),
      reminder({ id: 4, scheduledTime: "08:00" }),
    ];
    expect(todaysReminders(list, MONDAY_9AM).map((r) => r.id)).toEqual([4, 1]);
  });
  it("orders mixed once + daily entries by time-of-day", () => {
    const list = [
      reminder({ id: 1, scheduledTime: "09:00" }),
      reminder({ id: 2, scheduleType: "once", scheduledTime: "2026-09-21T08:00" }),
      reminder({ id: 3, scheduleType: "once", scheduledTime: "2026-09-21T14:00" }),
    ];
    expect(todaysReminders(list, MONDAY_9AM).map((r) => r.id)).toEqual([2, 1, 3]);
  });
});

describe("timeOfDay", () => {
  it("extracts HH:MM from both schedule formats", () => {
    expect(timeOfDay("10:00")).toBe("10:00");
    expect(timeOfDay("2026-09-21T08:05")).toBe("08:05");
  });
  it("orders mixed formats chronologically", () => {
    const daily = reminder({ scheduledTime: "09:00" });
    const once = reminder({ scheduleType: "once", scheduledTime: "2026-09-21T08:00" });
    expect(byScheduledTime(once, daily)).toBeLessThan(0);
    expect(byScheduledTime(daily, once)).toBeGreaterThan(0);
  });
});
