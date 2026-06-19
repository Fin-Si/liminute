import { DEFAULT_SETTINGS, type Settings } from "./types";

export function withLiminuteBackgroundDefaults(stored: Partial<Settings>): Partial<Settings> {
  const next = { ...stored };
  if (!next.focusCustomBackground) {
    next.focusCustomBackground = DEFAULT_SETTINGS.focusCustomBackground;
    next.focusCustomBackgroundId = DEFAULT_SETTINGS.focusCustomBackgroundId;
  }
  if (!next.breakCustomBackground) {
    next.breakCustomBackground = DEFAULT_SETTINGS.breakCustomBackground;
    next.breakCustomBackgroundId = DEFAULT_SETTINGS.breakCustomBackgroundId;
  }
  return next;
}
