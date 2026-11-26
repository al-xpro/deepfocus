"use client";

/**
 * The loading panel: until every model has arrived, so the scene is only ever
 * seen whole. A soft gradient in the colors of the visitor's time (set before
 * the first paint by app/loaderTone.ts), "Loading the ocean", and a thin line
 * that fills with the download. It fades away when the scene is ready.
 */
export default function SceneLoader({ visible, progress }: { visible: boolean; progress: number }) {
  return (
    <div
      aria-hidden={!visible}
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 transition-opacity duration-700 ease-(--ease-glass) ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      style={{
        color: "var(--loader-text, #ffffff)",
        background:
          "radial-gradient(ellipse 80% 45% at 50% 55%, rgb(255 255 255 / 0.12), transparent 70%), linear-gradient(180deg, var(--loader-top, #101a36), var(--loader-bottom, #060b18))",
      }}
    >
      <p id="loader-label" className="select-none text-sm font-light tracking-[0.04em]">
        Loading the ocean
      </p>
      <div
        role="progressbar"
        aria-labelledby="loader-label"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
        className="h-px w-40 overflow-hidden rounded-full bg-current/15"
      >
        <div
          className="h-full origin-left bg-current/70 transition-transform duration-500 ease-(--ease-glass)"
          style={{ transform: `scaleX(${progress / 100})` }}
        />
      </div>
    </div>
  );
}
