import { useEffect, useRef } from "react";
import type { BackgroundMotionProfile } from "../types";
import { convertFileSrc } from "@tauri-apps/api/core";

export const LIMINUTE_BACKGROUNDS = [
  ...Array.from({ length: 7 }, (_, index) => ({ id: `liminute-motion-${index + 1}`, name: `Motion ${index + 1}`, path: `/backgrounds/liminute/motion-${String(index + 1).padStart(2, "0")}.webm`, poster: `/backgrounds/liminute/motion-${String(index + 1).padStart(2, "0")}-poster.webp`, mediaType: "video" as const })),
  ...Array.from({ length: 13 }, (_, index) => ({ id: `liminute-still-${index + 1}`, name: `Still ${index + 1}`, path: `/backgrounds/liminute/still-${String(index + 1).padStart(2, "0")}.webp`, poster: `/backgrounds/liminute/still-${String(index + 1).padStart(2, "0")}.webp`, mediaType: "image" as const })),
];

export function SceneBackground({ animated, overlay, customUrl, motion }: { animated: boolean; overlay: number; customUrl?: string | null; motion?: BackgroundMotionProfile | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isNativeFile = Boolean(customUrl && /^[a-zA-Z]:[\\/]/.test(customUrl));
  const source = customUrl && isNativeFile && ("__TAURI_INTERNALS__" in window || window.location.hostname === "tauri.localhost") ? convertFileSrc(customUrl) : customUrl;
  const isStill = Boolean(source && /\.(avif|bmp|jpe?g|png|tiff?|webp)($|\?)/i.test(source));
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      if (document.hidden || reduced.matches || !animated) video.pause();
      else void video.play().catch(() => undefined);
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    reduced.addEventListener("change", sync);
    return () => { document.removeEventListener("visibilitychange", sync); reduced.removeEventListener("change", sync); };
  }, [animated, source]);
  const motionStyle = motion ? ({
    "--motion-scale": `${1 + motion.scale}`,
    "--motion-speed": `${motion.speed}s`,
    "--motion-drift": `${motion.drift * 100}%`,
  } as React.CSSProperties) : undefined;
  return (
    <div className={`scene ${source ? "has-custom" : ""} ${animated ? "is-animated" : "is-still"}`} aria-hidden="true">
      {source && isStill
        ? <img className={`scene__custom ${animated && motion?.enabled ? "has-custom-motion" : ""}`} style={motionStyle} src={source} alt="" />
        : source ? <video ref={videoRef} className="scene__custom" src={source} muted loop playsInline /> : null}
      <div className="scene__overlay" style={{ opacity: overlay }} />
    </div>
  );
}
