import { useEffect, useMemo, useState } from "react";
import { backend, type AppSnapshot } from "./lib/bridge";
import { DEFAULT_SETTINGS } from "./types";
import { createInitialTimer } from "./timerCore";
import TimerWindow from "./components/TimerWindow";
import SettingsWindow from "./components/SettingsWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";

const fallback: AppSnapshot = {
  settings: DEFAULT_SETTINGS,
  timer: createInitialTimer(DEFAULT_SETTINGS),
  tasks: [],
  todaySessions: 0,
};

export default function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot>(fallback);
  const settingsView = useMemo(() => {
    const nativeLabel = "__TAURI_INTERNALS__" in window || window.location.hostname === "tauri.localhost" ? getCurrentWindow().label : "";
    return nativeLabel === "settings" || new URLSearchParams(location.search).get("view") === "settings";
  }, []);

  useEffect(() => {
    let cleanup: undefined | (() => void);
    let cancelled = false;
    Promise.resolve(backend.subscribe((next) => !cancelled && setSnapshot(next)))
      .then((fn) => { if (cancelled) fn(); else cleanup = fn; })
      .catch((error) => console.error("Unable to connect to the native timer", error));
    return () => { cancelled = true; cleanup?.(); };
  }, []);

  return settingsView ? <SettingsWindow snapshot={snapshot} /> : <TimerWindow snapshot={snapshot} />;
}
