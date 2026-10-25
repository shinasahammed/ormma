import type { PopupPayload } from "./types";

/**
 * In-memory popup presentation queue (Phase 6).
 *
 * - FIFO: the earliest due reminder presents first.
 * - No duplicate ids across current + pending (rapid re-events are harmless).
 * - Presentation-only: NOT scheduling state and never persisted. The database
 *   stays authoritative; a restart simply starts with an empty queue.
 */
export interface PopupQueue {
  current: PopupPayload | null;
  pending: PopupPayload[];
}

export const EMPTY_QUEUE: PopupQueue = { current: null, pending: [] };

export function enqueue(queue: PopupQueue, payload: PopupPayload): PopupQueue {
  if (queue.current?.id === payload.id) {
    return queue;
  }
  if (queue.pending.some((item) => item.id === payload.id)) {
    return queue;
  }
  if (queue.current === null) {
    return { current: payload, pending: [] };
  }
  return { ...queue, pending: [...queue.pending, payload] };
}

/** Completes the current presentation and promotes the next pending item. */
export function advance(queue: PopupQueue): PopupQueue {
  const [next, ...rest] = queue.pending;
  return { current: next ?? null, pending: rest };
}

export function clearQueue(): PopupQueue {
  return { current: null, pending: [] };
}

export function queueSize(queue: PopupQueue): number {
  return (queue.current === null ? 0 : 1) + queue.pending.length;
}
