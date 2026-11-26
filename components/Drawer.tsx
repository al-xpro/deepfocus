"use client";

import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, animate, motion, useMotionValue } from "framer-motion";
import { useScrollFade } from "./useScrollFade";

// A bottom sheet for phones, following the field drawer on alxpro.com:
// drag anywhere (past a small threshold) to pull it down, the sheet travels
// further than the finger so a short flick dismisses it, a list gets the
// first refusal on a vertical drag, and focus stays inside while it's open.

/** Past this far (pointer travel), or this fast, letting go dismisses. */
const DISMISS_DISTANCE = 40;
const DISMISS_VELOCITY = 300;
/** How much further the sheet travels than the pointer. */
const DRAG_SPEED = 2;
/** Movement before a press counts as a drag; below it, it's a tap. */
const DRAG_THRESHOLD = 8;
const SPRING = { type: "spring", damping: 32, stiffness: 420 } as const;

const FOCUSABLE = ["a[href]", "button:not([disabled])", "input:not([disabled])", "[tabindex]"]
  .map((selector) => `${selector}:not([tabindex="-1"])`)
  .join(",");

function focusableIn(root: HTMLElement | null) {
  if (!root) return [] as HTMLElement[];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
}

const subscribeNothing = () => () => {};

export default function Drawer({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  // The portal needs document.body: false on the server and during hydration.
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const { scrollRef, fadeStyle } = useScrollFade();
  const titleId = useId();

  const y = useMotionValue(0);
  const dragStart = useRef<{ y: number } | null>(null);
  const lastMove = useRef<{ y: number; time: number } | null>(null);
  const pressY = useRef(0);
  const dragging = useRef(false);

  // The page behind doesn't scroll while the sheet is open.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Focus moves in, Tab cycles inside, and focus returns to the trigger on close.
  useEffect(() => {
    if (!open) return;
    const returnTo = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => {
      (focusableIn(sheetRef.current)[0] ?? sheetRef.current)?.focus({ preventScroll: true });
    }, 60);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusableIn(sheetRef.current);
      event.preventDefault();
      if (items.length === 0) return;
      const at = items.indexOf(document.activeElement as HTMLElement);
      const next = at === -1 ? 0 : (at + (event.shiftKey ? -1 : 1) + items.length) % items.length;
      items[next].focus({ preventScroll: true });
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown, true);
      returnTo?.focus?.({ preventScroll: true });
    };
  }, [open, onOpenChange]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => onOpenChange(false)}
            className="absolute inset-0 bg-black/10"
          />
          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            style={{ y }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            onPointerDown={(event) => {
              if ((event.target as HTMLElement).closest("[data-no-drag]")) return;
              dragStart.current = { y: event.clientY };
              pressY.current = event.clientY;
              lastMove.current = { y: event.clientY, time: performance.now() };
              dragging.current = false;
            }}
            onPointerMove={(event) => {
              const start = dragStart.current;
              if (!start) return;
              if (!dragging.current) {
                if (event.clientY - start.y < DRAG_THRESHOLD) return;
                // A list scrolled down scrolls; only at its top does a pull belong to the sheet.
                const scroller = (event.target as HTMLElement).closest<HTMLElement>(".overflow-y-auto");
                if (scroller && scroller.scrollTop > 0) {
                  dragStart.current = null;
                  return;
                }
                dragging.current = true;
                start.y += DRAG_THRESHOLD;
                event.currentTarget.setPointerCapture(event.pointerId);
              }
              y.set(Math.max(0, (event.clientY - start.y) * DRAG_SPEED));
              lastMove.current = { y: event.clientY, time: performance.now() };
            }}
            onPointerUp={(event) => {
              const wasDragging = dragging.current;
              dragStart.current = null;
              dragging.current = false;
              if (!wasDragging) return;
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              const traveled = event.clientY - pressY.current;
              const elapsed = Math.max(performance.now() - (lastMove.current?.time ?? 0), 1);
              const velocity = ((event.clientY - (lastMove.current?.y ?? event.clientY)) / elapsed) * 1000;
              if (traveled > DISMISS_DISTANCE || velocity > DISMISS_VELOCITY) onOpenChange(false);
              else animate(y, 0, SPRING);
            }}
            onPointerCancel={() => {
              dragStart.current = null;
              dragging.current = false;
              animate(y, 0, SPRING);
            }}
            className="glass glass-panel absolute inset-x-0 bottom-0 flex max-h-[85dvh] touch-none flex-col rounded-t-panel outline-none"
          >
            {/* The grabber: out of the tab order (Escape and the backdrop close the sheet). */}
            <button
              type="button"
              tabIndex={-1}
              aria-label="Close"
              onClick={() => onOpenChange(false)}
              className="flex h-7 w-full shrink-0 cursor-grab items-center justify-center active:cursor-grabbing"
            >
              <span className="h-1 w-10 rounded-full bg-current opacity-30" />
            </button>
            <h2 id={titleId} className="shrink-0 px-5 pb-4 text-[0.6875rem] font-normal uppercase tracking-[0.22em] text-on-glass-muted">
              {title}
            </h2>
            <div
              ref={scrollRef}
              style={fadeStyle}
              className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-5 pb-[max(2rem,env(safe-area-inset-bottom))]"
            >
              {children}
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
