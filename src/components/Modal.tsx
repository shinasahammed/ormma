import { useEffect, useRef, type ReactNode } from "react";
import { motion } from "framer-motion";

interface ModalProps {
  label: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Accessible dialog. Parent wraps in `<AnimatePresence>` for enter/exit.
 * Escape closes; initial focus moves inside; overlay click closes.
 */
export function Modal({ label, onClose, children }: ModalProps): JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    // Remember the opener so focus returns to it on close (a11y), then move
    // focus inside the dialog.
    const previous =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLElement>("input, select, button")?.focus();
    return () => {
      previous?.focus();
    };
  }, []);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/45"
        onClick={onClose}
      />
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-pop)]"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
