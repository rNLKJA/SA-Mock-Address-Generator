/** A trig-point survey mark: the triangle-in-circle used on survey plans. */
export function TrigMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden focusable="false">
      <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M16 6.5 25 23H7z"
        fill="none"
        stroke="var(--sa-red)"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="17.5" r="2.1" fill="currentColor" />
    </svg>
  );
}
