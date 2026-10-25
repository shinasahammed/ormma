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
 * Notch reveal: the dark panel is the "notch" (a small pill at the top edge)
 * that expands downward with a springy ease, Pip slides up from inside it,
 * then the reminder card fades and slides in. Every layer declares its own
 * initial/animate/exit with in-variant delays, so sequencing needs no timers
 * (the section is keyed by reminder id and mounts per queued reminder).
 * Only transform + opacity are animated.
 *
 * Entrance (~1.25s): notch idles (NOTCH_IDLE_S) → expands (NOTCH_EXPAND_S) →
 * Pip peeks up (AVATAR_PEEK_DELAY_S) → card text fades in (CARD_REVEAL_DELAY_S).
 * Auto-dismiss exit reverses the hierarchy (card → Pip → notch, ~0.4s);
 * a manual dismiss (click / Enter / Esc / snooze) collapses everything at
 * once in COLLAPSE_MANUAL_S.
 */

/** Tweak the choreography here (seconds). */
export const NOTCH_IDLE_S = 0.35;
export const NOTCH_EXPAND_S = 0.6;
export const AVATAR_PEEK_DELAY_S = NOTCH_IDLE_S + 0.3;
export const AVATAR_PEEK_S = 0.45;
export const CARD_REVEAL_DELAY_S = NOTCH_IDLE_S + 0.55;
export const CARD_REVEAL_S = 0.35;
export const CARD_REVEAL_OFFSET_PX = 8;
export const COLLAPSE_AUTO_S = 0.2;
export const COLLAPSE_MANUAL_S = 0.2;

/** cubic-bezier(0.34, 1.56, 0.64, 1): quick, slightly overshooting. */
export const NOTCH_SPRING_EASE: [number, number, number, number] = [0.34, 1.56, 0.64, 1];

/** Collapsed-notch shape: a narrow, short pill hanging from the top edge. */
const NOTCH_SCALE_X = 0.4;
const NOTCH_SCALE_Y = 0.14;

/** Who closed the popup: the timer (staged exit) or the user (instant collapse). */
export type DismissKind = "auto" | "manual";

/** Stage 1: the notch appears small, idles, then expands downward. */
export const backgroundDropVariants: Variants = {
  initial: { opacity: 0, scaleX: NOTCH_SCALE_X, scaleY: NOTCH_SCALE_Y },
  animate: {
    opacity: 1,
    scaleX: 1,
    scaleY: 1,
    transition: {
      opacity: { duration: 0.12 },
      default: { duration: NOTCH_EXPAND_S, ease: NOTCH_SPRING_EASE, delay: NOTCH_IDLE_S },
    },
  },
  exit: (kind: DismissKind = "auto") => ({
    opacity: 0,
    scaleX: NOTCH_SCALE_X,
    scaleY: NOTCH_SCALE_Y,
    transition:
      kind === "manual"
        ? { duration: COLLAPSE_MANUAL_S, ease: "easeIn" }
        : { duration: COLLAPSE_AUTO_S, ease: "easeIn", delay: 0.18 },
  }),
};

/** Stages 2-3: Pip slides up from inside the notch (clipped by it) and peeks out. */
export const avatarRiseVariants: Variants = {
  initial: { opacity: 0, y: "55%" },
  animate: {
    opacity: 1,
    y: "0%",
    transition: {
      opacity: { duration: 0.2, delay: AVATAR_PEEK_DELAY_S },
      default: { duration: AVATAR_PEEK_S, ease: NOTCH_SPRING_EASE, delay: AVATAR_PEEK_DELAY_S },
    },
  },
  exit: (kind: DismissKind = "auto") => ({
    opacity: 0,
    y: "45%",
    transition:
      kind === "manual"
        ? { duration: COLLAPSE_MANUAL_S, ease: "easeIn" }
        : { duration: COLLAPSE_AUTO_S, ease: "easeIn", delay: 0.1 },
  }),
};

/** Stage 4: the card fades and slides up into place (the text moves with it). */
export const bubbleUnfoldVariants: Variants = {
  initial: { opacity: 0, y: CARD_REVEAL_OFFSET_PX },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: CARD_REVEAL_S, ease: "easeOut", delay: CARD_REVEAL_DELAY_S },
  },
  exit: (kind: DismissKind = "auto") =>
    kind === "manual"
      ? { opacity: 0, scale: 0.92, transition: { duration: COLLAPSE_MANUAL_S, ease: "easeIn" } }
      : { opacity: 0, y: CARD_REVEAL_OFFSET_PX / 2, transition: { duration: COLLAPSE_AUTO_S, ease: "easeIn" } },
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
