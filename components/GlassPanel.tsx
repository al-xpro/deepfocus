"use client";

import { cloneElement, useSyncExternalStore, type ReactElement, type ReactNode } from "react";
import { Popover } from "radix-ui";
import Drawer from "./Drawer";

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
  trigger: ReactElement<Record<string, unknown>>;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Desktop only: which side of the trigger the popover opens on. */
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
  children: ReactNode;
}

/**
 * A glass panel: a popover anchored to its trigger on desktop (Radix: dialog
 * semantics, Escape, focus in and back to the trigger, `aria-expanded`), a
 * bottom sheet on phones (Drawer). Only one of the two is ever in the DOM.
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

  const heading = (
    <h2 className="mb-5 text-[0.6875rem] font-normal uppercase tracking-[0.22em] text-on-glass-muted">
      {title}
    </h2>
  );

  if (isPhone) {
    return (
      <>
        {cloneElement(trigger, {
          onClick: () => onOpenChange(!open),
          "aria-expanded": open,
          "aria-haspopup": "dialog",
        })}
        <Drawer open={open} onOpenChange={onOpenChange} title={title}>
          {children}
        </Drawer>
      </>
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
