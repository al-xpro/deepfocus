"use client";

import { useState, type Ref } from "react";
import GlassPanel from "./GlassPanel";
import TimePanel from "./TimePanel";
import { formatMinutes, sceneMinutes, useMinuteClock } from "./sceneClock";
import { startAmbience, stopAmbience, useAmbience } from "./ambience";

function SoundIcon({ playing }: { playing: boolean }) {
  const bars = [9, 13, 16, 12, 8];
  return (
    <span className="flex h-4 items-center gap-[3px]" aria-hidden="true">
      {bars.map((height, i) => (
        <span
          key={i}
          className="block w-[1.5px] rounded-full bg-current transition-[height,opacity] duration-500"
          style={{
            height: playing ? `${height}px` : "3px",
            opacity: playing ? 1 : 0.7,
            animation: playing ? `waveform ${0.9 + i * 0.12}s ease-in-out ${i * 0.15}s infinite` : "none",
          }}
        />
      ))}
    </span>
  );
}

function FocusIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden="true">
      <circle cx="10" cy="10" r="7" />
      <circle cx="10" cy="10" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * The control dock, top right: the scene time (opens the time panel), the ocean
 * sound, and focus mode.
 */
export default function Dock({
  timeOverride,
  onTimeChange,
  onFocus,
  focusButtonRef,
}: {
  timeOverride: number | null;
  onTimeChange: (hour: number | null) => void;
  onFocus: () => void;
  focusButtonRef?: Ref<HTMLButtonElement>;
}) {
  const now = useMinuteClock();
  const minutes = sceneMinutes(timeOverride, now);
  const label = minutes === null ? "00:00" : formatMinutes(minutes);
  const [timeOpen, setTimeOpen] = useState(false);
  const sound = useAmbience();

  return (
    <div className="glass flex items-center gap-0.5 rounded-full p-1">
      <GlassPanel
        title="Scene time"
        open={timeOpen}
        onOpenChange={setTimeOpen}
        trigger={
          <button
            type="button"
            aria-label={`Scene time, ${label}${timeOverride === null ? ", live" : ""}. Change the time`}
            className="glass-control flex h-10 cursor-pointer items-center gap-1.5 px-3.5 text-sm font-normal tabular-nums"
          >
            {timeOverride !== null ? (
              <span className="h-1 w-1 rounded-full bg-current opacity-60" aria-hidden="true" />
            ) : null}
            <span className={minutes === null ? "opacity-0" : undefined}>{label}</span>
          </button>
        }
      >
        <TimePanel value={timeOverride} minutes={minutes ?? 0} onChange={onTimeChange} />
      </GlassPanel>

      <button
        type="button"
        aria-label="Ocean sound"
        aria-pressed={sound !== "off"}
        onClick={() => (sound === "off" ? startAmbience() : stopAmbience())}
        className="glass-control flex h-10 w-10 cursor-pointer items-center justify-center"
      >
        <SoundIcon playing={sound === "on"} />
      </button>

      <button
        ref={focusButtonRef}
        type="button"
        aria-label="Focus mode"
        aria-keyshortcuts="F"
        onClick={onFocus}
        className="glass-control flex h-10 w-10 cursor-pointer items-center justify-center"
      >
        <FocusIcon />
      </button>
    </div>
  );
}
