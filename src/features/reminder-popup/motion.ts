/**
 * Popup motion configuration (Phase 6).
 *
 * The app `reduced_motion` setting wins when known; otherwise the OS
 * preference applies. "always" strips entrance/exit to a short fade.
 */

export type MotionPreference = "always" | "never";

/** Exit/hide sequencing delay (animation only — never scheduling). */
export const POPUP_EXIT_DELAY_MS = 180;
export const POPUP_EXIT_DELAY_REDUCED_MS = 30;

/**
 * Floating-bubble presentation lifetime per reminder. Firing the timer only
 * dismisses presentation (the occurrence was already consumed) — it advances
 * the queue exactly like Done. Paused while the snooze menu is open so the
 * popup never vanishes mid-choice.
 *
 * The duration is a persisted setting (seconds); this constant is only the
 * fallback before settings load.
 */
export const POPUP_AUTO_DISMISS_MS = 10_000;

/** Bounds matching the backend (`MIN_POPUP_SECS..=MAX_POPUP_SECS`). */
export const POPUP_DISMISS_MIN_SECS = 5;
export const POPUP_DISMISS_MAX_SECS = 600;

/** Resolves the persisted duration to a safe millisecond timeout. */
export function resolvePopupDismissMs(
  popupDurationSecs: number | null | undefined,
): number {
  if (
    typeof popupDurationSecs !== "number" ||
    !Number.isFinite(popupDurationSecs)
  ) {
    return POPUP_AUTO_DISMISS_MS;
  }
  const clamped = Math.min(
    POPUP_DISMISS_MAX_SECS,
    Math.max(POPUP_DISMISS_MIN_SECS, Math.floor(popupDurationSecs)),
  );
  return clamped * 1000;
}

export function resolveMotion(
  appReducedMotion: boolean | null,
  osReducedMotion: boolean,
): MotionPreference {
  const reduced = appReducedMotion ?? osReducedMotion;
  return reduced ? "always" : "never";
}

import type { TargetAndTransition, Transition, Variants } from "framer-motion";

/**
 * Staged top-center reveal (BACKGROUND DROP → PIP REVEAL → PIP SETTLE →
 * BUBBLE EXPANSION). Each visual layer declares its own initial/animate/exit
 * with in-variant transitions, so sequencing never depends on timers or
 * propagation subtleties — every layer simply mounts/unmounts with the
 * queued reminder (section is keyed by reminder id).
 *
 * Entrance (~0.9s total): background drops alone (delay 0.02) → avatar rises
 * clipped from inside it (delay 0.30) → bubble unfolds rightward from the
 * avatar (delay 0.55). Exit reverses the hierarchy (bubble → avatar →
 * background, ~0.38s total).
 */

/** Stage 1: dark container drops from above and settles alone. */
export const backgroundDropVariants: Variants = {
  initial: { opacity: 0, y: -30, scale: 0.96 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 380, damping: 30, delay: 0.02 },
  },
  exit: {
    opacity: 0,
    y: -22,
    scale: 0.97,
    transition: { duration: 0.2, ease: "easeIn", delay: 0.18 },
  },
};

/** Stages 2–3: avatar rises from inside the container (clipped by it) and settles. */
export const avatarRiseVariants: Variants = {
  initial: { opacity: 0, y: "55%", scale: 0.98 },
  animate: {
    opacity: 1,
    y: "0%",
    scale: 1,
    transition: { type: "spring", stiffness: 380, damping: 30, delay: 0.3 },
  },
  exit: {
    opacity: 0,
    y: "45%",
    transition: { duration: 0.2, ease: "easeIn", delay: 0.1 },
  },
};

/**
 * Stage 4: bubble unfolds rightward from the avatar. A left-anchored clip
 * wipe (not scaleX) keeps the title/message text distortion-free.
 */
export const bubbleUnfoldVariants: Variants = {
  initial: { opacity: 0, x: -18, clipPath: "inset(0 0 0 100% round 22px)" },
  animate: {
    opacity: 1,
    x: 0,
    clipPath: "inset(0 0 0% 0 round 22px)",
    transition: { type: "spring", stiffness: 420, damping: 34, delay: 0.55 },
  },
  exit: {
    opacity: 0,
    x: -14,
    clipPath: "inset(0 0 0 100% round 22px)",
    transition: { duration: 0.2, ease: "easeIn" },
  },
};

/** Reduced-motion exit: plain quick fade (transforms are stripped anyway). */
export const flatExit: TargetAndTransition = {
  opacity: 0,
  transition: { duration: 0.12 },
};

/**
 * PIP hover: gentle lift + slight scale/tilt + soft shadow swell. Playful
 * but premium (bounded: scale ≤ 1.06, lift ≤ 5px, tilt ≤ 2°).
 */
export const avatarHover = {
  scale: 1.05,
  y: -3,
  rotate: 1.5,
  boxShadow: "0 14px 40px -12px rgb(33 29 25 / 0.4)",
};

export const avatarHoverTransition: Transition = {
  type: "spring",
  stiffness: 400,
  damping: 22,
};
