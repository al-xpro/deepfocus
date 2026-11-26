// The DeepFocus mark: a wave whose crest curls around a point of focus.
// One stroke and a dot, in the current text color, clean down to 16 px.
export function Logo({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <path d="M3.5 22c4.8 0 7.6-3 9.4-7.2C14.9 10.2 18 7.5 21.6 7.5a6.5 6.5 0 1 1-5.9 9.3" />
      <circle cx="21.6" cy="14" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
