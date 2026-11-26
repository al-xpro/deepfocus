"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";
import MusicToggle from "./MusicToggle";
import Link from "next/link";
import SceneTimePanel from "./SceneTimePanel";
import { Logo } from "@/public/Logo";
import { AnimatePresence, motion } from "framer-motion";
import SceneLoadingOverlay from "./SceneLoadingOverlay";
import { getSceneSnapshot } from "./scene/timeUtils";

const OceanCanvas = dynamic(() => import("@/components/OceanCavas"), {
  ssr: false,
  loading: () => null,
});

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

interface PixelPoint {
  x: number;
  y: number;
  r: number;
  color: string;
}

function getDisplayDate(timeOverrideHour: number | null, baseDate: Date) {
  if (timeOverrideHour === null) {
    return baseDate;
  }

  const nextDate = new Date(baseDate);
  const wholeHours = Math.floor(timeOverrideHour);
  const minutes = Math.round((timeOverrideHour - wholeHours) * 60);
  nextDate.setHours(wholeHours, minutes, 0, 0);
  return nextDate;
}

// How bright the sky is, from 0 at night to 1 by day, from the scene's sun.
// Rounded so the page only updates it when it actually changes.
function getSkyLight(date: Date) {
  const t = Math.min(1, Math.max(0, (getSceneSnapshot(date).sunElev + 6) / 10));
  return (t * t * (3 - 2 * t)).toFixed(2);
}

function formatTimeLabel(date: Date) {
  return `${date.getHours().toString().padStart(2, "0")}:${date
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
}

const SERVER_CLOCK_SNAPSHOT = new Date(0);
let currentClockSnapshot = new Date();

function subscribeClock(onStoreChange: () => void) {
  const intervalId = window.setInterval(() => {
    currentClockSnapshot = new Date();
    onStoreChange();
  }, 1_000);
  return () => window.clearInterval(intervalId);
}

function getClientClockSnapshot() {
  return currentClockSnapshot;
}

function getServerClockSnapshot() {
  return SERVER_CLOCK_SNAPSHOT;
}

function WaitlistForm({
  placeholder,
  className,
  onSubmit,
  id,
}: {
  placeholder: string;
  className?: string;
  onSubmit?: (email: string) => void;
  id?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const newDataRef = useRef<PixelPoint[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [animating, setAnimating] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const draw = useCallback(() => {
    if (!inputRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    canvas.width = 800;
    canvas.height = 800;
    ctx.clearRect(0, 0, 800, 800);

    const computedStyles = getComputedStyle(inputRef.current);
    const fontSize = parseFloat(computedStyles.fontSize);
    ctx.font = `${fontSize * 2}px ${computedStyles.fontFamily}`;

    ctx.fillStyle = computedStyles.color;
    ctx.fillText(value, 16, 40);

    const imageData = ctx.getImageData(0, 0, 800, 800);
    const pixelData = imageData.data;
    const newData: Array<{ x: number; y: number; color: [number, number, number, number] }> = [];

    for (let t = 0; t < 800; t++) {
      const i = 4 * t * 800;
      for (let n = 0; n < 800; n++) {
        const e = i + 4 * n;
        if (pixelData[e + 3] > 0) {
          newData.push({
            x: n,
            y: t,
            color: [pixelData[e], pixelData[e + 1], pixelData[e + 2], pixelData[e + 3]],
          });
        }
      }
    }

    newDataRef.current = newData.map(({ x, y, color }) => ({
      x,
      y,
      r: 1,
      color: `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`,
    }));
  }, [value]);

  useEffect(() => {
    draw();
  }, [value, draw]);

  const animate = (start: number) => {
    const animateFrame = (pos: number = 0) => {
      requestAnimationFrame(() => {
        const newArr = [];
        for (let i = 0; i < newDataRef.current.length; i++) {
          const current = newDataRef.current[i];
          if (current.x < pos) {
            newArr.push(current);
          } else {
            if (current.r <= 0) {
              current.r = 0;
              continue;
            }
            current.x += Math.random() > 0.5 ? 1 : -1;
            current.y += Math.random() > 0.5 ? 1 : -1;
            current.r -= 0.05 * Math.random();
            newArr.push(current);
          }
        }
        newDataRef.current = newArr;
        const ctx = canvasRef.current?.getContext("2d");
        if (ctx) {
          ctx.clearRect(pos, 0, 800, 800);
          newDataRef.current.forEach((t) => {
            const { x: n, y: i, r: s, color } = t;
            if (n > pos) {
              ctx.beginPath();
              ctx.rect(n, i, s, s);
              ctx.fillStyle = color;
              ctx.strokeStyle = color;
              ctx.stroke();
            }
          });
        }
        if (newDataRef.current.length > 0) {
          animateFrame(pos - 8);
        } else {
          setValue("");
          setAnimating(false);
        }
      });
    };
    animateFrame(start);
  };

  const vanishAndSubmit = () => {
    setAnimating(true);
    draw();
    const maxX = newDataRef.current.reduce(
      (prev, current) => (current.x > prev ? current.x : prev),
      0
    );
    if (maxX === 0) {
      setValue("");
      setAnimating(false);
      return;
    }
    animate(maxX);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (!inputRef.current?.checkValidity()) return;
    e.preventDefault();
    if (animating || submitted) return;
    vanishAndSubmit();
    setSubmitted(true);
    onSubmit?.(value);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`glass flex h-14 w-full items-center gap-2 overflow-hidden rounded-full pl-5 pr-1.5 ${className}`}
    >
      <canvas
        ref={canvasRef}
        className={`pointer-events-none absolute left-3 top-[24%] origin-top-left scale-50 ${animating ? "opacity-100" : "opacity-0"}`}
      />

      <input
        ref={inputRef}
        value={value}
        type="email"
        name="email"
        id={id}
        autoComplete="email"
        required
        pattern={EMAIL_REGEX.source}
        onChange={(e) => !animating && setValue(e.target.value)}
        className={`h-full min-w-0 flex-1 truncate bg-transparent text-base text-text outline-none ${animating ? "text-transparent!" : ""}`}
      />

      <div className="pointer-events-none absolute inset-y-0 left-5 flex items-center">
        {!value && <p className="truncate text-base text-faint">{placeholder}</p>}
      </div>
      <button
        type="submit"
        className={`glass-selected relative z-20 flex h-11 shrink-0 cursor-pointer items-center rounded-full px-5 text-sm font-medium transition-[background-color,transform] duration-(--duration-fast) ease-(--ease-glass) active:scale-[0.97] sm:px-6 ${submitted ? "cursor-text" : ""}`}
      >
        {submitted ? "Thank you!" : "Reserve a spot"}
      </button>
    </form>
  );
}

export default function WaitlistPage() {
  const currentYear = new Date().getFullYear();
  const [timeOverrideHour, setTimeOverrideHour] = useState<number | null>(null);
  const clockNow = useSyncExternalStore(
    subscribeClock,
    getClientClockSnapshot,
    getServerClockSnapshot
  );
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [sceneProgress, setSceneProgress] = useState(0);
  const [sceneReady, setSceneReady] = useState(false);

  // FIX: memoize onToggle so MusicToggle receives a stable function reference.
  //
  // Without useCallback, every setClockNow tick (every second) re-renders
  // WaitlistPage and produces a new onToggle arrow function. MusicToggle then
  // re-renders, and — because onToggle is in handleButtonClick's useCallback
  // deps — handleButtonClick is also recreated on every tick.
  //
  // On mobile this constant churn means the button's onClick is being swapped
  // out repeatedly. When the user taps, the browser's gesture-activation token
  // is consumed by React's synthetic event dispatch; if React is mid-reconcile
  // (replacing the onClick reference), iOS Safari can silently drop the
  // resulting playVideo() postMessage to the cross-origin iframe.
  //
  // A stable onToggle → stable handleButtonClick → the tap always lands on
  // the same committed handler → playVideo() fires reliably on first touch.
  const handleMusicToggle = useCallback(() => {
    setIsMusicPlaying((playing) => !playing);
  }, []);

  const displayDate = getDisplayDate(timeOverrideHour, clockNow);
  const displayedSceneTime = formatTimeLabel(displayDate);
  const skyLight = getSkyLight(displayDate);

  useEffect(() => {
    document.documentElement.style.setProperty("--sky-light", skyLight);
  }, [skyLight]);

  return (
    <>
      <SceneLoadingOverlay visible={!sceneReady} progress={sceneProgress} />
      <OceanCanvas
        timeOverrideHour={timeOverrideHour}
        onProgressChange={setSceneProgress}
        onReadyChange={setSceneReady}
      />
      <div className="fixed inset-0 z-10 pointer-events-none ocean-veil" />

      <div className="relative z-20 flex flex-col w-full min-h-screen pointer-events-none">
        {/* NAV */}
        <nav className="relative flex mx-auto justify-between items-center px-5 sm:px-10 py-4 sm:py-8 animate-fade-down w-full min-w-[320px] max-w-[1024px] pointer-events-auto">
          <div className="flex items-center gap-2.5 text-ocean">
            <Logo className="h-9 w-9 text-accent" />
            <span className="sr-only text-[1.0625rem] font-semibold tracking-[-0.01em] sm:not-sr-only">
              DeepFocus
            </span>
          </div>
          <div className="glass flex items-center gap-0.5 rounded-full p-1">
            <SceneTimePanel
              value={timeOverrideHour}
              onChange={setTimeOverrideHour}
              label={displayedSceneTime}
            />
            <MusicToggle
              isPlaying={isMusicPlaying}
              onToggle={handleMusicToggle}
            />
          </div>
        </nav>

        {/* MAIN */}
        <main className="relative flex-1 flex mx-auto flex-col items-center justify-center px-6 py-2 sm:py-10 text-center pointer-events-none w-full min-w-[320px] max-w-[1024px]">
          <AnimatePresence>
            {!isMusicPlaying && (
              <motion.div
                key="hero-copy"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16, filter: "blur(12px)" }}
                transition={{ duration: 0.45, ease: "easeInOut" }}
                className="flex flex-col items-center"
              >
                <div className="glass pointer-events-auto mb-5 inline-flex items-center gap-2.5 rounded-full px-3.5 py-1.5 animate-fade-up [animation-delay:350ms] sm:mb-7">
                  <span className="glow-dot h-1.5 w-1.5 rounded-full bg-accent animate-pulse-dot" />
                  <span className="text-[0.6875rem] font-medium uppercase tracking-[0.22em]">
                    Early access open
                  </span>
                </div>
                <h1 className="mb-4 max-w-3xl font-display text-[clamp(3rem,8vw,5.5rem)] leading-none tracking-[-0.015em] text-ocean-strong animate-fade-up [animation-delay:500ms] sm:mb-6">
                  The future of <br />
                  <em className="text-accent-adaptive italic">deep work</em>
                  <br />
                  is setting sail.
                </h1>
                <label
                  htmlFor="email"
                  className="mb-6 max-w-md text-base leading-relaxed text-muted text-ocean animate-fade-up [animation-delay:650ms] sm:mb-9 sm:text-lg"
                >
                  A focused workspace for makers, writers, and builders who crave clarity. Built on
                  calm. <span className="whitespace-nowrap">Launching soon.</span>
                </label>
                <div className="w-full max-w-md pointer-events-auto animate-rise-in [animation-delay:800ms]">
                  <WaitlistForm placeholder="your@email.com" className="w-full" id="email" />
                  <p className="mt-3 text-[0.8125rem] text-muted text-ocean sm:mt-4">
                    No spam — just one note when we open{" "}
                    <span className="whitespace-nowrap">the hatch</span>.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* FOOTER */}
        <footer className="relative flex mx-auto flex-col sm:flex-row justify-between items-center px-5 sm:px-10 py-4 sm:py-8 animate-fade-down w-full min-w-[320px] max-w-[1024px] pointer-events-auto">
          <div className="flex flex-col sm:flex-row w-full items-center sm:justify-between gap-2">
            <p className="text-sm text-muted text-ocean">
              © {currentYear} DeepFocus. All rights reserved.
            </p>
            <p className="text-sm text-muted text-ocean">
              Designed and developed by&nbsp;
              <Link
                href="https://alxpro.com"
                target="_blank"
                className="rounded-sm font-medium text-text underline-offset-4 hover:underline"
              >
                AlxPro
              </Link>
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}
