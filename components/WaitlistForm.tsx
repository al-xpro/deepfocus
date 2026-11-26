"use client";

import { useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

interface PixelPoint {
  x: number;
  y: number;
  r: number;
  color: string;
}

type Status = "idle" | "vanishing" | "done";

/**
 * The waitlist, as a concept: nothing is sent and nothing is kept. On submit
 * the address dissolves into particles (a fade under reduced motion), and the
 * button says so.
 */
export default function WaitlistForm({ id }: { id: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef<PixelPoint[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const reduceMotion = useReducedMotion();

  // Scans the typed text into pixels, once, at submit.
  const scanText = () => {
    const input = inputRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { willReadFrequently: true });
    if (!input || !canvas || !ctx) return;

    canvas.width = 800;
    canvas.height = 800;
    ctx.clearRect(0, 0, 800, 800);
    const styles = getComputedStyle(input);
    ctx.font = `${styles.fontWeight} ${parseFloat(styles.fontSize) * 2}px ${styles.fontFamily}`;
    ctx.fillStyle = styles.color;
    ctx.fillText(value, 16, 40);

    const data = ctx.getImageData(0, 0, 800, 800).data;
    const points: PixelPoint[] = [];
    for (let y = 0; y < 800; y++) {
      for (let x = 0; x < 800; x++) {
        const i = 4 * (y * 800 + x);
        if (data[i + 3] > 0) {
          points.push({ x, y, r: 1, color: `rgba(${data[i]}, ${data[i + 1]}, ${data[i + 2]}, ${data[i + 3] / 255})` });
        }
      }
    }
    pointsRef.current = points;
  };

  const finish = () => {
    setValue("");
    setStatus("done");
    window.setTimeout(() => setStatus("idle"), 3200);
  };

  const vanish = (start: number) => {
    const frame = (pos: number) => {
      requestAnimationFrame(() => {
        const next: PixelPoint[] = [];
        for (const point of pointsRef.current) {
          if (point.x < pos) {
            next.push(point);
          } else if (point.r > 0) {
            point.x += Math.random() > 0.5 ? 1 : -1;
            point.y += Math.random() > 0.5 ? 1 : -1;
            point.r -= 0.05 * Math.random();
            next.push(point);
          }
        }
        pointsRef.current = next;
        const ctx = canvasRef.current?.getContext("2d");
        if (ctx) {
          ctx.clearRect(pos, 0, 800, 800);
          for (const { x, y, r, color } of next) {
            if (x > pos) {
              ctx.beginPath();
              ctx.rect(x, y, r, r);
              ctx.strokeStyle = color;
              ctx.stroke();
            }
          }
        }
        if (next.length > 0) frame(pos - 8);
        else finish();
      });
    };
    frame(start);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status !== "idle" || !value) return;
    setStatus("vanishing");

    if (reduceMotion) {
      window.setTimeout(finish, 400);
      return;
    }
    scanText();
    const maxX = pointsRef.current.reduce((max, point) => Math.max(max, point.x), 0);
    if (maxX === 0) finish();
    else vanish(maxX);
  };

  const vanishing = status === "vanishing";

  return (
    <form onSubmit={handleSubmit} className="glass flex h-14 w-full items-center gap-2 overflow-hidden rounded-full pl-5 pr-1.5">
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={`pointer-events-none absolute left-3 top-[24%] origin-top-left scale-50 ${
          vanishing && !reduceMotion ? "opacity-100" : "opacity-0"
        }`}
      />
      <label htmlFor={id} className="sr-only">
        Email
      </label>
      <input
        ref={inputRef}
        id={id}
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="Email"
        value={value}
        onChange={(event) => status === "idle" && setValue(event.target.value)}
        className={`h-full min-w-0 flex-1 truncate bg-transparent text-base font-light text-on-glass outline-none transition-opacity duration-300 placeholder:text-on-glass-muted ${
          vanishing ? (reduceMotion ? "opacity-0" : "text-transparent!") : ""
        }`}
      />
      <button
        type="submit"
        className="glass-selected relative z-20 flex h-11 shrink-0 cursor-pointer items-center rounded-full px-6 text-sm font-normal transition-colors duration-(--duration-fast)"
      >
        {status === "done" ? "Not sent" : "Join"}
      </button>
    </form>
  );
}
