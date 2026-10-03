/** A small mark in the DAS colours (red ring, blue half-disc). Decorative; the name next to it carries the meaning. */
export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="13" fill="none" stroke="#e02a31" strokeWidth="5" />
      <path d="M16 9a7 7 0 0 1 0 14z" fill="#2f86c8" />
    </svg>
  )
}
