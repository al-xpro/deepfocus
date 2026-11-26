"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { musicConfig } from "./musicConfig";

// The slice of the YouTube IFrame Player API this component uses.
interface YouTubePlayer {
  playVideo(): void;
  pauseVideo(): void;
  setVolume(volume: number): void;
  getVolume(): number;
}

interface YouTubePlayerEvent {
  target: YouTubePlayer;
}

interface YouTubeNamespace {
  Player: new (
    elementId: string,
    options: {
      videoId: string;
      playerVars?: Record<string, number>;
      events?: { onReady?: (event: YouTubePlayerEvent) => void };
    }
  ) => YouTubePlayer;
}

declare global {
  interface Window {
    onYouTubeIframeAPIReady: () => void;
    YT?: YouTubeNamespace;
  }
}

export default function MusicToggle({
  isPlaying,
  onToggle,
}: {
  isPlaying: boolean;
  onToggle: () => void;
}) {
  const playerRef       = useRef<YouTubePlayer | null>(null);
  const fadeIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isReady, setIsReady] = useState(false);

  const videoId = useMemo(() => {
    const url   = musicConfig.youtubeUrl;
    const match = url.match(
      /(?:youtu\.be\/|youtube\.com(?:\/embed\/|\/v\/|\/watch\?v=|\/user\/\S+|\/ytscreeningroom\?v=))([\w-]{11})/
    );
    return match ? match[1] : null;
  }, []);

  const barHeights = [12, 14, 18, 16, 12, 14];

  const clearFade = useCallback(() => {
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }
  }, []);

  // ── Initialize YouTube player ─────────────────────────────────────────────
  useEffect(() => {
    if (!videoId || typeof window === "undefined") return;

    const initPlayer = () => {
      if (!window.YT) return;
      playerRef.current = new window.YT.Player("youtube-player", {
        videoId,
        playerVars: {
          autoplay:    0,
          controls:    0,
          disablekb:   1,
          enablejsapi: 1,
          playsinline: 1,
          // No mute:1 here. We use setVolume(0) in onReady instead.
          // On iOS Safari, unMute() called from JS never unlocks the iframe's
          // audio context — even inside a gesture handler — because the gesture
          // token does not cross the cross-origin iframe boundary. Keeping the
          // player in an unmuted-but-silent state (volume=0) sidesteps this
          // entirely: playVideo() in the click handler is the only gesture-gated
          // call we ever need to make.
        },
        events: {
          onReady: (event: YouTubePlayerEvent) => {
            // setVolume does NOT require a gesture token — safe to call here.
            // The player is now unmuted and silent, ready for playVideo().
            event.target.setVolume(0);
            setIsReady(true);
          },
        },
      });
    };

    if (window.YT?.Player) {
      initPlayer();
    } else {
      window.onYouTubeIframeAPIReady = initPlayer;
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const tag = document.createElement("script");
        tag.src   = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
      }
    }
  }, [videoId]);

  // ── Volume fade effect ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isReady || !playerRef.current) return;

    clearFade();

    if (isPlaying) {
      // Player is already playing at volume 0 (started in click handler).
      // Fade volume up — no gesture token needed for setVolume().
      let vol = 0;
      fadeIntervalRef.current = setInterval(() => {
        vol = Math.min(vol + 2, 100);
        playerRef.current?.setVolume(vol);
        if (vol >= 100) clearFade();
      }, 30);
    } else {
      // Fade out, then pause and reset volume to 0 for next play.
      let vol = playerRef.current.getVolume() as number;
      fadeIntervalRef.current = setInterval(() => {
        vol = Math.max(vol - 4, 0);
        playerRef.current?.setVolume(vol);
        if (vol <= 0) {
          clearFade();
          playerRef.current?.pauseVideo();
          // Reset to silent so next playVideo() starts at 0 before fading in.
          playerRef.current?.setVolume(0);
        }
      }, 30);
    }

    return clearFade;
  }, [isPlaying, isReady, clearFade]);

  // ── Click handler ─────────────────────────────────────────────────────────
  //
  // playVideo() is the only call that requires a gesture token.
  // unMute() is gone — the player is always in an unmuted state (volume
  // controls silence instead), so there is nothing to unlock across the iframe.
  const handleButtonClick = useCallback(() => {
    if (!isReady || !playerRef.current) {
      return;
    }

    if (!isPlaying) {
      playerRef.current.playVideo(); // only gesture-gated call — works on iOS
    }
    onToggle();
  }, [isPlaying, isReady, onToggle]);

  return (
    <>
      <button
        type="button"
        name="music button"
        aria-label="music button"
        onClick={handleButtonClick}
        className="glass-control relative z-50 flex h-10 w-10 cursor-pointer items-center justify-center text-text"
      >
        <span className="flex h-[32px] items-center gap-[3px]">
          {barHeights.map((height, i) => (
            <span
              key={i}
              className="block w-px rounded-full bg-current transition-all duration-500"
              style={{
                height:                  isPlaying ? `${height}px` : "3px",
                opacity:                 isPlaying ? 1 : 0.6,
                transformOrigin:         "center",
                animationName:           isPlaying ? "waveform" : "none",
                animationDuration:       `${0.8 + i * 0.1}s`,
                animationTimingFunction: "linear",
                animationIterationCount: "infinite",
                animationDelay:          `${i * 0.15}s`,
              }}
            />
          ))}
        </span>
      </button>

      <div id="youtube-player" className="hidden" />
    </>
  );
}
