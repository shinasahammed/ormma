/**
 * Pip — papa.app's original popup companion. Pure inline SVG, no assets or
 * dependencies. A sleepy-happy pebble with a sprout, drawn in a fixed warm
 * palette that reads on the `--color-nook` backdrop in both themes
 * (decorative only: `aria-hidden`, the dialog label carries the meaning).
 */
export function PopupAvatar({
  className = "",
  blink = false,
}: {
  className?: string;
  /** Periodic eye blink (CSS, transform only). Off for reduced motion. */
  blink?: boolean;
}): JSX.Element {
  const eye = blink ? "pip-eye" : undefined;
  return (
    <svg
      viewBox="0 0 96 112"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {/* sprout */}
      <path
        d="M48 30 C48 23 48 19 48 14"
        stroke="var(--color-accent)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <ellipse
        cx="39"
        cy="16"
        rx="8"
        ry="4.6"
        transform="rotate(-28 39 16)"
        fill="var(--color-accent)"
        opacity="0.85"
      />
      <ellipse
        cx="57"
        cy="12"
        rx="8"
        ry="4.6"
        transform="rotate(24 57 12)"
        fill="var(--color-accent)"
        opacity="0.65"
      />
      {/* pebble body */}
      <rect x="15" y="28" width="66" height="76" rx="29" fill="#f3e6d3" />
      <ellipse cx="48" cy="100" rx="20" ry="4" fill="#2e2620" opacity="0.06" />
      {/* sleepy-happy eyes */}
      <path
        className={eye}
        d="M32 60 q5.5 5.5 11 0"
        stroke="#2e2620"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        className={eye}
        d="M53 60 q5.5 5.5 11 0"
        stroke="#2e2620"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      {/* smile */}
      <path
        d="M43 74 q5 4.5 10 0"
        stroke="#2e2620"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {/* blush */}
      <circle cx="29" cy="70" r="3.6" fill="var(--color-accent)" opacity="0.5" />
      <circle cx="67" cy="70" r="3.6" fill="var(--color-accent)" opacity="0.5" />
    </svg>
  );
}
