import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./types";
import { createInitialTimer, durationFor, formatTime, nextPhase, shouldRefreshTimerDuration } from "./timerCore";
import { localeFromTags } from "./locale";
import { withLiminuteBackgroundDefaults } from "./settingsDefaults";

describe("timer core", () => {
  it("uses the configured durations", () => {
    expect(durationFor("focus", DEFAULT_SETTINGS)).toBe(1_500_000);
    expect(durationFor("shortBreak", DEFAULT_SETTINGS)).toBe(300_000);
    expect(durationFor("longBreak", DEFAULT_SETTINGS)).toBe(900_000);
  });

  it("schedules a long break after the fourth focus", () => {
    const state = { ...createInitialTimer(DEFAULT_SETTINGS), completedInCycle: 3 };
    expect(nextPhase(state, DEFAULT_SETTINGS)).toBe("longBreak");
    expect(nextPhase({ ...state, completedInCycle: 2 }, DEFAULT_SETTINGS)).toBe("shortBreak");
  });

  it("returns to focus after every break", () => {
    const state = createInitialTimer(DEFAULT_SETTINGS);
    expect(nextPhase({ ...state, phase: "shortBreak" }, DEFAULT_SETTINGS)).toBe("focus");
    expect(nextPhase({ ...state, phase: "longBreak" }, DEFAULT_SETTINGS)).toBe("focus");
  });

  it("formats remaining time without showing negative values", () => {
    expect(formatTime(1_500_000)).toBe("25:00");
    expect(formatTime(1_001)).toBe("00:02");
    expect(formatTime(-50)).toBe("00:00");
  });

  it("never refreshes a paused or running timer when settings change", () => {
    expect(shouldRefreshTimerDuration("paused", "focus", { focusMinutes: 40 })).toBe(false);
    expect(shouldRefreshTimerDuration("paused", "focus", { pinned: true })).toBe(false);
    expect(shouldRefreshTimerDuration("running", "focus", { windowMode: "expanded" })).toBe(false);
  });

  it("refreshes only the matching inactive phase duration", () => {
    expect(shouldRefreshTimerDuration("idle", "focus", { focusMinutes: 40 })).toBe(true);
    expect(shouldRefreshTimerDuration("awaiting", "shortBreak", { shortBreakMinutes: 8 })).toBe(true);
    expect(shouldRefreshTimerDuration("idle", "focus", { shortBreakMinutes: 8 })).toBe(false);
    expect(shouldRefreshTimerDuration("idle", "focus", { pinned: true })).toBe(false);
  });

  it("uses Russian only for a Russian system locale", () => {
    expect(localeFromTags(["ru-RU", "en-US"])).toBe("ru");
    expect(localeFromTags(["en-US"])).toBe("en");
    expect(localeFromTags(["de-DE"])).toBe("en");
    expect(localeFromTags(undefined)).toBe("en");
  });

  it("uses Motion 6 and Motion 1 when legacy backgrounds are absent", () => {
    const migrated = withLiminuteBackgroundDefaults({ focusCustomBackground: null, breakCustomBackground: null });
    expect(migrated.focusCustomBackgroundId).toBe("liminute-motion-6");
    expect(migrated.breakCustomBackgroundId).toBe("liminute-motion-1");
  });

  it("preserves imported and existing Liminute backgrounds", () => {
    const migrated = withLiminuteBackgroundDefaults({
      focusCustomBackground: "C:\\media\\focus.webm", focusCustomBackgroundId: "imported-focus",
      breakCustomBackground: "/backgrounds/liminute/motion-04.webm", breakCustomBackgroundId: "liminute-motion-4",
    });
    expect(migrated.focusCustomBackgroundId).toBe("imported-focus");
    expect(migrated.breakCustomBackgroundId).toBe("liminute-motion-4");
  });
});
