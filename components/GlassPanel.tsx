"use client";

import { useSyncExternalStore, type ReactElement, type ReactNode } from "react";
import { Dialog, Popover } from "radix-ui";
import { motion, useDragControls } from "framer-motion";

const PHONE_QUERY = "(max-width: 639px)";

function subscribePhone(onChange: () => void) {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useIsPhone() {
  return useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false
  );
}

interface GlassPanelProps {
  /** The button that opens the panel. */
  trigger: ReactElement;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Desktop only: which side of the trigger the popover opens on. */
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
  children: ReactNode;
}

/**
 * A glass panel: a popover anchored to its trigger on desktop, a bottom sheet
 * on phones. Radix handles the dialog semantics, Escape, focus moving in and
 * returning to the trigger, and `aria-expanded` on the trigger. Only one of
 * the two is ever in the DOM.
 */
export default function GlassPanel({
  trigger,
  title,
  open,
  onOpenChange,
  side = "bottom",
  align = "end",
  children,
}: GlassPanelProps) {
  const isPhone = useIsPhone();
  const dragControls = useDragControls();

  const heading = (
    <h2 className="mb-5 text-[0.6875rem] font-normal uppercase tracking-[0.22em] text-on-glass-muted">
      {title}
    </h2>
  );

  if (isPhone) {
    return (
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="sheet-overlay fixed inset-0 z-50 bg-black/30" />
          <Dialog.Content asChild aria-describedby={undefined}>
            <motion.div
              drag="y"
              dragListener={false}
              dragControls={dragControls}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.5 }}
              dragSnapToOrigin
              onDragEnd={(_, info) => {
                if (info.offset.y > 80 || info.velocity.y > 400) onOpenChange(false);
              }}
              className="sheet glass glass-panel fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-panel px-5 pb-[max(2rem,env(safe-area-inset-bottom))] outline-none"
            >
              <div
                className="flex cursor-grab touch-none justify-center pb-4 pt-3 active:cursor-grabbing"
                onPointerDown={(event) => dragControls.start(event)}
                aria-hidden="true"
              >
                <span className="h-1 w-10 rounded-full bg-current opacity-30" />
              </div>
              <Dialog.Title asChild>{heading}</Dialog.Title>
              {children}
            </motion.div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side={side}
          align={align}
          sideOffset={12}
          collisionPadding={16}
          aria-label={title}
          className="popover glass glass-panel z-50 w-[21rem] rounded-panel p-5 outline-none"
        >
          {heading}
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
