import { describe, expect, it } from "vitest";
import { advance, clearQueue, enqueue, queueSize, EMPTY_QUEUE, type PopupQueue } from "./queue";
import type { PopupPayload } from "./types";

function payload(id: number, overrides: Partial<PopupPayload> = {}): PopupPayload {
  return {
    id,
    title: `Reminder ${id}`,
    message: null,
    kind: "reminder",
    scheduleType: "daily",
    scheduledTime: "10:00",
    daysOfWeek: null,
    snoozeDuration: 5,
    tone: null,
    ...overrides,
  };
}

describe("enqueue", () => {
  it("presents the first arrival immediately", () => {
    const queue = enqueue(EMPTY_QUEUE, payload(1));
    expect(queue.current?.id).toBe(1);
    expect(queue.pending).toEqual([]);
  });

  it("queues later arrivals in FIFO order", () => {
    let queue = enqueue(EMPTY_QUEUE, payload(1));
    queue = enqueue(queue, payload(2));
    queue = enqueue(queue, payload(3));
    expect(queue.current?.id).toBe(1);
    expect(queue.pending.map((item) => item.id)).toEqual([2, 3]);
  });

  it("drops duplicates of current and pending ids", () => {
    let queue = enqueue(EMPTY_QUEUE, payload(1));
    queue = enqueue(queue, payload(2));
    const before = queue;
    expect(enqueue(queue, payload(1))).toBe(before);
    expect(enqueue(queue, payload(2))).toBe(before);
    // Rapid re-events collapse to a single presentation.
    let rapid: PopupQueue = EMPTY_QUEUE;
    for (let i = 0; i < 5; i += 1) {
      rapid = enqueue(rapid, payload(9));
    }
    expect(queueSize(rapid)).toBe(1);
  });
});

describe("advance", () => {
  it("promotes pending in order and empties cleanly", () => {
    let queue = enqueue(enqueue(enqueue(EMPTY_QUEUE, payload(1)), payload(2)), payload(3));
    queue = advance(queue);
    expect(queue.current?.id).toBe(2);
    queue = advance(queue);
    expect(queue.current?.id).toBe(3);
    queue = advance(queue);
    expect(queue.current).toBeNull();
    expect(queue.pending).toEqual([]);
    // Advancing an empty queue is a safe no-op.
    expect(advance(queue).current).toBeNull();
  });
});

describe("clearQueue", () => {
  it("drops current and pending (shutdown path)", () => {
    const queue = enqueue(enqueue(EMPTY_QUEUE, payload(1)), payload(2));
    expect(clearQueue()).toEqual(EMPTY_QUEUE);
    expect(queueSize(queue)).toBe(2);
    expect(queueSize(clearQueue())).toBe(0);
  });

  it("accepts new arrivals after dismissal", () => {
    let queue = enqueue(enqueue(EMPTY_QUEUE, payload(1)), payload(2));
    queue = advance(queue);
    expect(queue.current?.id).toBe(2);
    queue = enqueue(queue, payload(3));
    expect(queue.pending.map((item) => item.id)).toEqual([3]);
    queue = advance(queue);
    expect(queue.current?.id).toBe(3);
  });
});
