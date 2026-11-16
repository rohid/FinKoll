// Brand mark: a two-tone Σ (sum) — teal upper arm, blue lower arm, split at the
// vertex. Fixed brand colours (independent of the active palette) so the identity
// stays consistent across themes. Pairs with the "FinKoll" wordmark.
export function KollMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M80 18 L20 18 L53.6 50"
        fill="none"
        stroke="#1D9E75"
        strokeWidth="11"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M53.6 50 L20 82 L80 82"
        fill="none"
        stroke="#378ADD"
        strokeWidth="11"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
