export type Phase = "focus" | "shortBreak" | "longBreak";
export type TimerStatus = "idle" | "running" | "paused" | "awaiting";
export type WindowMode = "mini" | "compact" | "expanded";
export type Locale = "ru" | "en";
export type SceneId = "rainy-room" | "ember" | "forest" | "night-city" | "ocean" | "aurora" | "pixel-night" | "sunrise";

export interface TimerState {
  phase: Phase;
  status: TimerStatus;
  deadline: number | null;
  remainingMs: number;
  phaseDurationMs: number;
  completedInCycle: number;
  activeTaskId: string | null;
}

export interface Task {
  id: string;
  title: string;
  estimate: number;
  completed: number;
  done: boolean;
  position: number;
}

export interface FocusSession {
  id: string;
  taskId: string | null;
  startedAt: number;
  completedAt: number;
  durationSeconds: number;
  completed: boolean;
}

export interface ImportedAsset {
  id: string;
  name: string;
  kind: "background" | "sound";
  path: string;
  mime: string;
  size: number;
  mediaType?: "image" | "video" | "audio";
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
}

export interface BackgroundMotionProfile {
  enabled: boolean;
  scale: number;
  speed: number;
  drift: number;
}

export const DEFAULT_MOTION_PROFILE: BackgroundMotionProfile = {
  enabled: false,
  scale: 0.03,
  speed: 18,
  drift: 0.01,
};

export interface Settings {
  locale: Locale;
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  longBreakEvery: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  autostart: boolean;
  startMinimized: boolean;
  pinned: boolean;
  windowMode: WindowMode;
  focusScenes: SceneId[];
  breakScenes: SceneId[];
  focusScene: SceneId;
  breakScene: SceneId;
  focusCustomBackground: string | null;
  breakCustomBackground: string | null;
  focusCustomBackgroundId: string | null;
  breakCustomBackgroundId: string | null;
  backgroundMotionProfiles: Record<string, BackgroundMotionProfile>;
  shuffleScenes: boolean;
  animationsEnabled: boolean;
  overlay: number;
  textColor: string;
  accentColor: string;
  fontScale: number;
  radius: number;
  panelOpacity: number;
  progressStyle: "ring" | "bar" | "none";
  soundEnabled: boolean;
  soundVolume: number;
  soundId: "chime" | "bell" | "soft" | string;
  customSoundPath: string | null;
  focusCompleteSound: string;
  focusStartSound: string;
  focusCompleteCustomPath: string | null;
  focusStartCustomPath: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  locale: "en",
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
  autoStartBreaks: false,
  autoStartFocus: false,
  autostart: false,
  startMinimized: false,
  pinned: false,
  windowMode: "compact",
  focusScenes: ["rainy-room", "forest", "night-city", "pixel-night"],
  breakScenes: ["ember", "ocean", "aurora", "sunrise"],
  focusScene: "rainy-room",
  breakScene: "ember",
  focusCustomBackground: "/backgrounds/liminute/motion-06.webm",
  breakCustomBackground: "/backgrounds/liminute/motion-01.webm",
  focusCustomBackgroundId: "liminute-motion-6",
  breakCustomBackgroundId: "liminute-motion-1",
  backgroundMotionProfiles: {},
  shuffleScenes: false,
  animationsEnabled: true,
  overlay: 0.36,
  textColor: "#F6EAD2",
  accentColor: "#EAD0A0",
  fontScale: 1,
  radius: 24,
  panelOpacity: 0.18,
  progressStyle: "ring",
  soundEnabled: true,
  soundVolume: 0.7,
  soundId: "chime",
  customSoundPath: null,
  focusCompleteSound: "focus-complete-2",
  focusStartSound: "focus-start-2",
  focusCompleteCustomPath: null,
  focusStartCustomPath: null,
};
