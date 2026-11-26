"use client";

import { formatMinutes } from "./sceneClock";

const PRESETS = [
  { label: "Sunrise", minutes: 5 * 60 },
  { label: "Noon", minutes: 12 * 60 },
  { label: "Sunset", minutes: 18 * 60 },
  { label: "Night", minutes: 0 },
];

function Sun() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" aria-hidden="true">
      <circle cx="8" cy="8" r="2.8" />
      <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" />
    </svg>
  );
}

function Moon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" aria-hidden="true">
      <path d="M13 9.6A5.5 5.5 0 0 1 6.4 3a5.5 5.5 0 1 0 6.6 6.6Z" />
    </svg>
  );
}

/**
 * The time panel: live or custom, a 24-hour scrubber, and four presets. Every
 * change goes straight to the scene; the panel holds no state of its own.
 */
export default function TimePanel({
  value,
  minutes,
  onChange,
}: {
  /** The chosen hour, or null for the live time. */
  value: number | null;
  /** Minutes since midnight currently shown by the scene. */
  minutes: number;
  onChange: (hour: number | null) => void;
}) {
  const live = value === null;
  const setMinutes = (next: number) => onChange(next / 60);

  const segment = (active: boolean) =>
    `h-9 cursor-pointer rounded-full text-sm font-normal transition-colors duration-(--duration-fast) ${
      active ? "glass-selected" : "glass-control text-on-glass-muted"
    }`;

  return (
    <div className="flex flex-col gap-6">
      <div role="group" aria-label="Time source" className="grid grid-cols-2 gap-1 rounded-full bg-(--glass-well) p-1">
        <button type="button" aria-pressed={live} onClick={() => onChange(null)} className={segment(live)}>
          Live
        </button>
        <button type="button" aria-pressed={!live} onClick={() => live && setMinutes(minutes)} className={segment(!live)}>
          Custom
        </button>
      </div>

      <p className="select-none text-center text-5xl font-extralight tabular-nums tracking-tight" aria-hidden="true">
        {formatMinutes(minutes)}
      </p>

      <div className="flex flex-col gap-2">
        <input
          type="range"
          min={0}
          max={1435}
          step={5}
          value={minutes - (minutes % 5)}
          onChange={(event) => setMinutes(Number(event.target.value))}
          aria-label="Scene time"
          aria-valuetext={formatMinutes(minutes)}
          className="time-range w-full"
        />
        <div className="flex select-none items-center justify-between px-0.5 text-[0.6875rem] font-light text-on-glass-muted" aria-hidden="true">
          <Moon />
          <span>06</span>
          <Sun />
          <span>18</span>
          <Moon />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {PRESETS.map((preset) => {
          const active = !live && minutes === preset.minutes;
          return (
            <button
              key={preset.label}
              type="button"
              aria-pressed={active}
              onClick={() => setMinutes(preset.minutes)}
              className={`flex h-14 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-control transition-colors duration-(--duration-fast) ${
                active ? "glass-selected" : "glass-control bg-(--glass-well)"
              }`}
            >
              <span className="text-[0.8125rem] font-normal">{preset.label}</span>
              <span className={`text-[0.6875rem] font-light tabular-nums ${active ? "" : "text-on-glass-muted"}`}>
                {formatMinutes(preset.minutes)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
