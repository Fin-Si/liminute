import { useEffect, useRef } from "react";
import type { BackgroundMotionProfile, SceneId } from "../types";
import { convertFileSrc } from "@tauri-apps/api/core";

export const SCENES: { id: SceneId; name: string; palette: string; art?: string }[] = [
  { id: "rainy-room", name: "Rainy study", palette: "#416b73", art: "/backgrounds/rainy-study.png" },
  { id: "ember", name: "Warm ember", palette: "#c46d42" },
  { id: "forest", name: "Mossy forest", palette: "#47745d" },
  { id: "night-city", name: "Night city", palette: "#5d5689" },
  { id: "ocean", name: "Quiet ocean", palette: "#3c8291" },
  { id: "aurora", name: "Soft aurora", palette: "#6a6faa" },
  { id: "pixel-night", name: "Pixel night", palette: "#3f466f" },
  { id: "sunrise", name: "Morning lake", palette: "#cf8f67", art: "/backgrounds/morning-lake.png" },
];

export const LIMINUTE_BACKGROUNDS = [
  ...Array.from({ length: 7 }, (_, index) => ({ id: `liminute-motion-${index + 1}`, name: `Liminute Motion ${index + 1}`, path: `/backgrounds/liminute/motion-${String(index + 1).padStart(2, "0")}.webm`, mediaType: "video" as const })),
  ...Array.from({ length: 13 }, (_, index) => ({ id: `liminute-still-${index + 1}`, name: `Liminute Still ${index + 1}`, path: `/backgrounds/liminute/still-${String(index + 1).padStart(2, "0")}.webp`, mediaType: "image" as const })),
];

export function SceneBackground({ scene, animated, overlay, customUrl, motion }: { scene: SceneId; animated: boolean; overlay: number; customUrl?: string | null; motion?: BackgroundMotionProfile | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isNativeFile = Boolean(customUrl && /^[a-zA-Z]:[\\/]/.test(customUrl));
  const source = customUrl && isNativeFile && ("__TAURI_INTERNALS__" in window || window.location.hostname === "tauri.localhost") ? convertFileSrc(customUrl) : customUrl;
  const isStill = Boolean(source && /\.(avif|bmp|jpe?g|png|tiff?|webp)($|\?)/i.test(source));
  const art = SCENES.find((item) => item.id === scene)?.art;
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
    <div className={`scene scene--${scene} ${source ? "has-custom" : ""} ${art && !source ? "has-art" : ""} ${animated ? "is-animated" : "is-still"}`} aria-hidden="true">
      {source && isStill
        ? <img className={`scene__custom ${animated && motion?.enabled ? "has-custom-motion" : ""}`} style={motionStyle} src={source} alt="" />
        : source ? <video ref={videoRef} className="scene__custom" src={source} muted loop playsInline /> : null}
      {!source && art && <img className="scene__art" src={art} alt="" />}
      <div className="scene__sky" />
      <div className="scene__orb" />
      <div className="scene__land scene__land--back" />
      <div className="scene__land scene__land--front" />
      <div className="scene__window"><span /><span /><span /></div>
      <div className="scene__rain" />
      <div className="scene__stars" />
      <div className="scene__glow" />
      <div className="scene__overlay" style={{ opacity: overlay }} />
    </div>
  );
}
