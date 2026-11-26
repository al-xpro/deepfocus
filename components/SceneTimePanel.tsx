"use client";

import { useEffect, useState, useRef, useCallback, useId, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";

const subscribeToNothing = () => () => {};

const HOUR_LABELS: Record<number, string> = {
  0: "Midnight",
  5: "Sunrise",
  8: "Morning",
  12: "Noon",
  18: "Sunset",
  20: "Dusk",
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getTimeParts(value: number | null) {
  if (value === null) {
    const now = new Date();
    return { hours: now.getHours(), minutes: now.getMinutes() };
  }
  const hours = Math.floor(value);
  const minutes = Math.round((value - hours) * 60);
  return { hours: clamp(hours, 0, 23), minutes: clamp(minutes, 0, 59) };
}

function PanelContent({
  value,
  onChange,
  onClose,
  showDragHandle = false,
}: {
  value: number | null;
  onChange: (hour: number | null) => void;
  onClose: () => void;
  showDragHandle?: boolean;
}) {
  // The inputs always mirror `value`: every edit goes through onChange.
  const { hours: hoursInput, minutes: minutesInput } = getTimeParts(value);

  const idPrefix = useId();

  const handleManualChange = (h: number, m: number) => {
    const clH = clamp(h, 0, 23);
    const clM = clamp(m, 0, 59);
    onChange(clH + clM / 60);
  };

  return (
    <div className="glass glass-panel flex w-full min-w-[320px] flex-col rounded-t-panel p-5 pb-10 text-text sm:rounded-panel sm:pb-5">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-[0.6875rem] font-medium uppercase tracking-[0.22em] text-faint">
          Scene time
        </h2>
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors duration-(--duration-fast) ${
            value === null ? "glass-selected" : "bg-white/8 text-muted hover:bg-white/14"
          }`}
        >
          {value === null ? "Live Local Time" : "Manual Time"}
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="field flex flex-col items-center rounded-control bg-white/6 p-3 ring-1 ring-white/10 ring-inset">
          <label
            htmlFor={`${idPrefix}-hours`}
            className="mb-1 text-[0.6875rem] font-medium uppercase tracking-[0.18em] text-faint"
          >
            Hours
          </label>
          <input
            type="number"
            id={`${idPrefix}-hours`}
            name="hours"
            aria-label="hours"
            value={hoursInput}
            onChange={(e) => handleManualChange(parseInt(e.target.value || "0"), minutesInput)}
            className="w-full bg-transparent text-center font-mono text-2xl tabular-nums text-text outline-none"
          />
        </div>
        <div className="field flex flex-col items-center rounded-control bg-white/6 p-3 ring-1 ring-white/10 ring-inset">
          <label
            htmlFor={`${idPrefix}-minutes`}
            className="mb-1 text-[0.6875rem] font-medium uppercase tracking-[0.18em] text-faint"
          >
            Minutes
          </label>
          <input
            type="number"
            id={`${idPrefix}-minutes`}
            name="minutes"
            aria-label="minutes"
            value={minutesInput}
            onChange={(e) => handleManualChange(hoursInput, parseInt(e.target.value || "0"))}
            className="w-full bg-transparent text-center font-mono text-2xl tabular-nums text-text outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {Object.entries(HOUR_LABELS).map(([h, label]) => {
          const hour = parseInt(h);
          const active = value !== null && Math.floor(value) === hour;
          return (
            <button
              key={hour}
              type="button"
              onClick={() => handleManualChange(hour, 0)}
              className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-control py-3 transition-colors duration-(--duration-fast) ${
                active ? "glass-selected" : "bg-white/6 ring-1 ring-white/10 ring-inset hover:bg-white/12"
              }`}
            >
              <span className={`font-mono text-xs tabular-nums ${active ? "text-ink/70" : "text-faint"}`}>
                {hour.toString().padStart(2, "0")}:00
              </span>
              <span className="text-[0.8125rem] font-medium leading-none">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function SceneTimePanel({
  value,
  onChange,
  label,
}: {
  value: number | null;
  onChange: (hour: number | null) => void;
  label: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  // false on the server and during hydration, true afterwards: the portal needs document.body.
  const mounted = useSyncExternalStore(subscribeToNothing, () => true, () => false);
  const containerRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    if (!isOpen || !buttonRef.current || window.innerWidth < 640) return; // 640 is sm: breakpoint

    const rect = buttonRef.current.getBoundingClientRect();
    const panelWidth = 384; // w-[24rem]
    const gap = 8;

    let left = rect.left;

    // Right-edge collision detection
    if (left + panelWidth > window.innerWidth - 16) {
      left = Math.max(16, rect.right - panelWidth);
    }

    setDropdownPos({
      top: rect.bottom + window.scrollY + gap,
      left: left + window.scrollX,
    });
  }, [isOpen]);

  // Update position on open and on window resize
  useEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener("resize", updatePosition);
    }
    return () => window.removeEventListener("resize", updatePosition);
  }, [isOpen, updatePosition]);

  // Compute position whenever the panel opens
  useEffect(() => {
    if (!isOpen || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const panelWidth = 384; // w-[24rem]
    const gap = 8; // px below the button

    let left = rect.left;
    // If it would overflow the right edge, align to the button's right edge instead
    if (left + panelWidth > window.innerWidth - 16) {
      left = rect.right - panelWidth;
    }

    setDropdownPos({ top: rect.bottom + gap, left });
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        portalRef.current &&
        !portalRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleScroll = (event: Event) => {
      if (window.innerWidth < 640) return;
      if (portalRef.current && portalRef.current.contains(event.target as Node)) return;
      setIsOpen(false);
    };

    window.addEventListener("scroll", handleScroll, { passive: true, capture: true });
    return () => window.removeEventListener("scroll", handleScroll, { capture: true });
  }, [isOpen]);

  return (
    <div className="relative pointer-events-auto" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        aria-label="time panel"
        name="time panel"
        onClick={() => setIsOpen(!isOpen)}
        className="glass-control flex h-10 cursor-pointer items-center gap-1.5 pl-3.5 pr-3 font-mono text-sm font-medium tabular-nums tracking-[0.04em] text-text"
      >
        <span suppressHydrationWarning>{label}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 12 12"
          className={`h-3 w-3 text-muted transition-transform duration-(--duration-base) ease-(--ease-glass) ${isOpen ? "rotate-180" : ""}`}
        >
          <path
            d="M3 4.5 6 7.5 9 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {isOpen && (
              <div className="fixed inset-0 z-[9999] pointer-events-none" ref={portalRef}>
                {/* Backdrop — mobile only */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setIsOpen(false)}
                  className="absolute inset-0 bg-black/40 shadow-lg backdrop-blur-[2px] pointer-events-auto sm:hidden"
                />

                {/* Desktop dropdown */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  style={{ top: dropdownPos.top, left: dropdownPos.left }}
                  className="pointer-events-auto absolute hidden max-h-[80vh] w-[24rem] overflow-y-auto rounded-panel sm:block"
                >
                  <PanelContent
                    value={value}
                    onChange={onChange}
                    onClose={() => setIsOpen(false)}
                  />
                </motion.div>

                <motion.div
                  drag="y"
                  dragConstraints={{ top: 0 }}
                  dragElastic={{ top: 0, bottom: 0.3 }}
                  onDragEnd={(_, info) => {
                    // Close if dragged > 80 px down OR flicked fast downward
                    if (info.offset.y > 80 || info.velocity.y > 400) {
                      setIsOpen(false);
                    }
                  }}
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", damping: 25, stiffness: 200 }}
                  className="fixed inset-x-0 bottom-0 sm:hidden pointer-events-auto
                             max-h-[85dvh] overflow-y-auto"
                  style={{ touchAction: "none" }}
                >
                  <PanelContent
                    value={value}
                    onChange={onChange}
                    onClose={() => setIsOpen(false)}
                    showDragHandle
                  />
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
