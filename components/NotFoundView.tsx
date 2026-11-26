"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useTimePreference } from "./timePreference";

const OceanCanvas = dynamic(() => import("./OceanCanvas"), {
  ssr: false,
  loading: () => null,
});

/**
 * The 404 page: the open sea at the visitor's own time (live, or the hour they
 * chose on the home page), without models, and one way back.
 */
export default function NotFoundView() {
  const timeOverride = useTimePreference();

  return (
    <div className="relative min-h-[max(100dvh,34rem)]">
      <OceanCanvas timeOverrideHour={timeOverride} showModels={false} />
      <div className="ocean-veil pointer-events-none absolute inset-0 z-10" />

      <div className="pointer-events-none relative z-20 flex min-h-[max(100dvh,34rem)] flex-col">
        <main className="flex flex-1 select-none flex-col items-center justify-center px-6 py-16 text-center">
          <p className="mb-6 text-[0.6875rem] font-normal uppercase tracking-[0.24em] text-ocean-strong animate-fade-up [animation-delay:200ms]">
            404
          </p>
          <h1 className="text-[clamp(2.5rem,6.4vw,4.75rem)] font-normal leading-[1.04] tracking-[-0.035em] text-ocean-strong animate-fade-up [animation-delay:350ms]">
            <em className="text-accent-adaptive italic">Lost</em> at sea.
          </h1>
          <p className="mt-5 text-lg font-extralight text-muted text-ocean animate-fade-up [animation-delay:500ms] sm:text-xl">
            This page drifted away.
          </p>
          <Link
            href="/"
            className="glass pointer-events-auto mt-10 flex h-12 items-center rounded-full px-7 text-sm font-normal transition-opacity duration-(--duration-fast) animate-fade-up [animation-delay:650ms] hover:opacity-80"
          >
            Back to shore
          </Link>
        </main>
      </div>
    </div>
  );
}
