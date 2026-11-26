/**
 * A time like "09:41", one fixed-width cell per character, so the text never
 * shifts as the digits change, whatever the font's own figures do.
 */
export default function Digits({ value, className }: { value: string; className?: string }) {
  return (
    <span className={`inline-flex ${className ?? ""}`} aria-hidden="true">
      {value.split("").map((char, i) => (
        <span key={i} className={`inline-block text-center ${char === ":" ? "w-[0.32em]" : "w-[0.62em]"}`}>
          {char}
        </span>
      ))}
    </span>
  );
}
