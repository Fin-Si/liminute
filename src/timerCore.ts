import type { Phase, Settings, TimerState } from "./types";

export const durationFor = (phase: Phase, settings: Settings) => {
  const minutes = phase === "focus" ? settings.focusMinutes : phase === "shortBreak" ? settings.shortBreakMinutes : settings.longBreakMinutes;
  return minutes * 60_000;
};

export const nextPhase = (state: TimerState, settings: Settings): Phase => {
  if (state.phase !== "focus") return "focus";
  return state.completedInCycle + 1 >= settings.longBreakEvery ? "longBreak" : "shortBreak";
};

export const formatTime = (milliseconds: number) => {
  const total = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

export const createInitialTimer = (settings: Settings): TimerState => ({
  phase: "focus",
  status: "idle",
  deadline: null,
  remainingMs: durationFor("focus", settings),
  phaseDurationMs: durationFor("focus", settings),
  completedInCycle: 0,
  activeTaskId: null,
});

export const shouldRefreshTimerDuration = (
  status: TimerState["status"],
  phase: Phase,
  patch: Partial<Settings>,
) => {
  if (status !== "idle" && status !== "awaiting") return false;
  const durationKey = phase === "focus" ? "focusMinutes" : phase === "longBreak" ? "longBreakMinutes" : "shortBreakMinutes";
  return Object.prototype.hasOwnProperty.call(patch, durationKey);
};
