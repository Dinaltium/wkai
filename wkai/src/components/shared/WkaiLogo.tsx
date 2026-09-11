/**
 * The WKAI mark: a W whose centre peak rises into an A, closed by a crossbar.
 * Broad-nib construction — down-strokes thick, up-strokes thin.
 *
 * Inline rather than an <img> so the W inherits `currentColor` and the bar
 * follows `--accent` — the mark then tracks both the light/dark theme and the
 * user's accent choice without needing separate asset variants.
 */
export function WkaiLogo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 1024 1024" className={className} aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M104,250L236,250L325.99,658.42L483,140L578,140L735.01,658.42L825,250L883,250L768.58,769.28L790,840L658,840L493.5,296.84L350.42,769.28L366,840L234,840Z" />
      <path fill="rgb(var(--accent))" d="M408.35,578L578.65,578L599.85,648L387.15,648Z" />
    </svg>
  );
}
