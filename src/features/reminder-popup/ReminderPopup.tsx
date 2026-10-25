import { useEffect, useRef } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import {
  avatarHover,
  avatarHoverTransition,
  avatarRiseVariants,
  backgroundDropVariants,
  bubbleUnfoldVariants,
  flatExit,
} from "./motion";
import { useReminderPopup } from "./useReminderPopup";
import { PopupAvatar } from "./PopupAvatar";

/**
 * Companion popup as a staged top-center "notch" reveal (NOTCH EXPANDS → PIP
 * PEEKS UP → CARD FADES IN) on the transparent window:
 * just the companion and a clean speech bubble (bold title + soft
 * subtitle) — no headers, pills, or buttons.
 *
 * Layers (each declares its own staged variants; sequencing needs no timers):
 * - BackgroundDropLayer: dark panel starts as a small notch, expands downward.
 * - AvatarRevealLayer: avatar slides up clipped from inside the panel.
 * - BubbleRevealLayer: card fades + slides up (text never stretches); exits
 *   first on a timed dismiss, and everything collapses at once on a manual one.
 * The section itself is a static frame keyed by reminder id, so every queued
 * item enters cleanly and the whole notification still dismisses as one.
 *
 * - Clicking anywhere (or Enter/Esc) dismisses, exactly like Done.
 * - Each presentation auto-dismisses after the configured duration and
 *   advances the queue.
 * - Presentation only: the occurrence was already consumed by the Rust
 *   scheduler, so dismissing never touches schedule state.
 */
export function ReminderPopup(): JSX.Element {
  const popup = useReminderPopup();
  const { t } = popup;
  const current = popup.leaving ? null : popup.queue.current;
  const sectionRef = useRef<HTMLElement>(null);
  // Reduced motion: transforms are stripped by MotionConfig; clip-path is
  // not, so layers render settled (initial={false}) and exit with a plain
  // fade — fully functional, minimal movement.
  const reduced = popup.motion === "always";

  useEffect(() => {
    if (current !== null) {
      sectionRef.current?.focus();
    }
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function onKeyDown(event: React.KeyboardEvent): void {
    if (event.key === "Escape") {
      popup.close();
      return;
    }
    const target = event.target as HTMLElement;
    const typing = ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
    if (event.key === "Enter" && !typing) {
      popup.done();
    }
  }

  return (
    <MotionConfig reducedMotion={popup.motion}>
      <div className="flex h-screen flex-col bg-transparent px-5 pt-1.5 pb-5 text-ink" onKeyDown={onKeyDown}>
        <AnimatePresence mode="wait" custom={popup.leaveKind}>
          {current !== null && (
            <motion.section
              key={current.id}
              ref={sectionRef}
              role="dialog"
              tabIndex={-1}
              aria-label={`${t("popup.greeting")}: ${current.title}`}
              onClick={popup.done}
              className="relative mx-auto mb-auto flex w-full items-end outline-none"
            >
              {/* Stage 1 — BackgroundDropLayer: dark panel drops alone first.
                  Static frame for the avatar reveal; stays behind it (z-0). */}
              <motion.div
                className="relative z-0 mb-2 w-[220px] shrink-0"
                style={{ originX: 0.5, originY: 0 }}
                variants={backgroundDropVariants}
                initial={reduced ? false : "initial"}
                animate="animate"
                exit={reduced ? flatExit : "exit"}
              >
                <div className="h-[148px] overflow-hidden rounded-[24px] bg-nook shadow-[var(--shadow-card)]">
                  {/* Stages 2–3 — AvatarRevealLayer: rises clipped from inside
                      the panel (overflow-hidden), then settles. Hover lives on
                      the inner wrapper so it never fights the entrance. */}
                  <motion.div
                    className="flex h-full items-end justify-center"
                    variants={avatarRiseVariants}
                    initial={reduced ? false : "initial"}
                    animate="animate"
                    exit={reduced ? flatExit : "exit"}
                  >
                    <motion.div
                      whileHover={reduced ? undefined : { ...avatarHover, transition: avatarHoverTransition }}
                    >
                      {popup.avatar !== null ? (
                        <img
                          src={popup.avatar}
                          alt=""
                          aria-hidden="true"
                          className="h-[136px] w-auto object-contain"
                        />
                      ) : (
                        <PopupAvatar blink={!reduced} className="-mb-5 h-[162px] w-auto" />
                      )}
                    </motion.div>
                  </motion.div>
                </div>
              </motion.div>

              {/* Stage 4 — BubbleRevealLayer: unfolds rightward from the
                  avatar (left-anchored clip wipe, text never stretches) and
                  retracts first on exit. Tail points at the avatar. */}
              <motion.div
                className="relative z-10 -ml-11 min-w-0 rounded-[24px] bg-white py-4 pr-7 pl-[17px] shadow-[var(--shadow-pop)]"
                style={{ originX: 0, originY: 0.5 }}
                variants={bubbleUnfoldVariants}
                initial={reduced ? false : "initial"}
                animate="animate"
                exit={reduced ? flatExit : "exit"}
              >
                {/* Tail: a curved hook off the bubble's top-left, pointing at Pip. */}
                <svg
                  aria-hidden="true"
                  viewBox="-14 9 28 27"
                  className="absolute top-[9px] -left-3.5 h-[27px] w-7 fill-white"
                >
                  <path d="M-14 18C-13 26-8 33 0 36L14 36L14 9L10 9C8 11 6 14 4 16C-1 20-9 20-14 18Z" />
                </svg>
                <h1 className="text-[16px] leading-5 font-bold break-words text-[#1a1a1a]">
                  {current.title}
                </h1>
                {current.message !== null && current.message.trim().length > 0 && (
                  <p className="mt-1 max-h-[120px] overflow-y-auto text-[14px] leading-5 break-words text-[#6b6b70]">
                    {current.message}
                  </p>
                )}
              </motion.div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
