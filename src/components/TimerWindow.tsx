import { useEffect } from "react";
import type { AppSnapshot } from "../lib/bridge";
import { formatTime } from "../timerCore";
import { phaseLabel } from "../i18n";
import TimerSurface from "./TimerSurface";

export default function TimerWindow({ snapshot }: { snapshot: AppSnapshot }) {
  const { settings, timer } = snapshot;
  useEffect(() => {
    document.documentElement.style.setProperty("--window-radius", "0px");
    document.documentElement.style.setProperty("--text-color", settings.textColor);
    document.documentElement.style.setProperty("--accent", settings.accentColor);
    document.documentElement.style.setProperty("--panel-opacity", `${settings.panelOpacity}`);
    document.documentElement.style.setProperty("--font-scale", `${settings.fontScale}`);
    document.title = `${formatTime(timer.remainingMs)} · ${phaseLabel(settings.locale, timer.phase)}`;
  }, [settings, timer.remainingMs, timer.phase]);
  return <TimerSurface snapshot={snapshot} />;
}
