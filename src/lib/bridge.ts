import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { createInitialTimer, durationFor, nextPhase, shouldRefreshTimerDuration } from "../timerCore";
import { DEFAULT_SETTINGS, type FocusSession, type Settings, type Task, type TimerState, type WindowMode } from "../types";

export interface AppSnapshot {
  timer: TimerState;
  settings: Settings;
  tasks: Task[];
  todaySessions: number;
}

type Listener = (snapshot: AppSnapshot) => void;
const isTauri = () => "__TAURI_INTERNALS__" in window || window.location.hostname === "tauri.localhost";

class BrowserBackend {
  private snapshot: AppSnapshot;
  private listeners = new Set<Listener>();
  private sessions: FocusSession[];
  private lastTick = Date.now();

  constructor() {
    const storedSettings = this.read<Partial<Settings>>("settings", {});
    const legacy = storedSettings as Partial<Settings> & { breakCompleteSound?: string; breakCompleteCustomPath?: string | null };
    if (!storedSettings.focusStartSound && legacy.breakCompleteSound) {
      storedSettings.focusStartSound = legacy.breakCompleteSound.replace("break-complete", "focus-start");
    }
    if (!storedSettings.focusStartCustomPath && legacy.breakCompleteCustomPath) storedSettings.focusStartCustomPath = legacy.breakCompleteCustomPath;
    if (storedSettings.textColor?.toLowerCase() === "#f8f7ef") storedSettings.textColor = "#F6EAD2";
    if (storedSettings.accentColor?.toLowerCase() === "#f4c56b") storedSettings.accentColor = "#EAD0A0";
    if (storedSettings.focusCompleteSound === "focus-complete-1" && !storedSettings.focusCompleteCustomPath) storedSettings.focusCompleteSound = "focus-complete-2";
    if (storedSettings.focusStartSound === "focus-start-1" && !storedSettings.focusStartCustomPath) storedSettings.focusStartSound = "focus-start-2";
    if (storedSettings.focusCustomBackground && !storedSettings.focusCustomBackgroundId) storedSettings.focusCustomBackgroundId = `legacy:${storedSettings.focusCustomBackground}`;
    if (storedSettings.breakCustomBackground && !storedSettings.breakCustomBackgroundId) storedSettings.breakCustomBackgroundId = `legacy:${storedSettings.breakCustomBackground}`;
    const settings = { ...DEFAULT_SETTINGS, ...storedSettings };
    this.sessions = this.read<FocusSession[]>("sessions", []);
    const storedTimer = this.read<TimerState | null>("timer", null);
    const timer = storedTimer ?? createInitialTimer(settings);
    if (timer.status === "running" && timer.deadline && timer.deadline <= Date.now()) {
      timer.remainingMs = 0;
      timer.status = "awaiting";
      timer.deadline = null;
    }
    this.snapshot = {
      timer,
      settings,
      tasks: this.read<Task[]>("tasks", []),
      todaySessions: this.countToday(),
    };
    window.setInterval(() => this.tick(), 250);
  }

  private read<T>(key: string, fallback: T): T {
    try { return JSON.parse(localStorage.getItem(`cozy:${key}`) ?? "") as T; } catch { return fallback; }
  }

  private persist() {
    localStorage.setItem("cozy:settings", JSON.stringify(this.snapshot.settings));
    localStorage.setItem("cozy:timer", JSON.stringify(this.snapshot.timer));
    localStorage.setItem("cozy:tasks", JSON.stringify(this.snapshot.tasks));
    localStorage.setItem("cozy:sessions", JSON.stringify(this.sessions));
  }

  private countToday() {
    const day = new Date().toDateString();
    return this.sessions.filter((session) => session.completed && new Date(session.completedAt).toDateString() === day).length;
  }

  private emit() {
    this.persist();
    this.snapshot = { ...this.snapshot, tasks: [...this.snapshot.tasks], timer: { ...this.snapshot.timer }, settings: { ...this.snapshot.settings } };
    this.listeners.forEach((listener) => listener(this.snapshot));
  }

  private tick() {
    const now = Date.now();
    if (this.snapshot.timer.status !== "running" || !this.snapshot.timer.deadline) return;
    const remaining = Math.max(0, this.snapshot.timer.deadline - now);
    if (remaining > 0) {
      if (now - this.lastTick >= 500) {
        this.snapshot.timer.remainingMs = remaining;
        this.lastTick = now;
        this.emit();
      }
      return;
    }
    this.completePhase(now);
  }

  private completePhase(now: number) {
    const timer = this.snapshot.timer;
    const completedFocus = timer.phase === "focus";
    if (completedFocus) {
      this.sessions.push({
        id: crypto.randomUUID(), taskId: timer.activeTaskId, startedAt: now - timer.phaseDurationMs,
        completedAt: now, durationSeconds: Math.round(timer.phaseDurationMs / 1000), completed: true,
      });
      if (timer.activeTaskId) {
        const task = this.snapshot.tasks.find((candidate) => candidate.id === timer.activeTaskId);
        if (task) task.completed += 1;
      }
      timer.completedInCycle += 1;
    }
    const phase = nextPhase({ ...timer, completedInCycle: completedFocus ? timer.completedInCycle - 1 : timer.completedInCycle }, this.snapshot.settings);
    if (timer.phase === "longBreak") timer.completedInCycle = 0;
    const auto = phase === "focus" ? this.snapshot.settings.autoStartFocus : this.snapshot.settings.autoStartBreaks;
    const duration = durationFor(phase, this.snapshot.settings);
    Object.assign(timer, { phase, status: auto ? "running" : "awaiting", deadline: auto ? now + duration : null, remainingMs: duration, phaseDurationMs: duration });
    if (this.snapshot.settings.shuffleScenes) {
      const scenes = phase === "focus" ? this.snapshot.settings.focusScenes : this.snapshot.settings.breakScenes;
      if (scenes.length) {
        const picked = scenes[Math.floor(now / 1000) % scenes.length];
        if (phase === "focus") this.snapshot.settings.focusScene = picked;
        else this.snapshot.settings.breakScene = picked;
      }
    }
    this.snapshot.todaySessions = this.countToday();
    playCompletionSound(this.snapshot.settings, completedFocus ? "focus" : "break");
    this.emit();
  }

  getSnapshot() { return Promise.resolve(this.snapshot); }
  subscribe(listener: Listener) { this.listeners.add(listener); listener(this.snapshot); return () => this.listeners.delete(listener); }

  command(action: "start" | "pause" | "reset" | "skip") {
    const timer = this.snapshot.timer;
    const now = Date.now();
    if (action === "start") {
      timer.status = "running";
      timer.deadline = now + timer.remainingMs;
    } else if (action === "pause" && timer.status === "running") {
      timer.remainingMs = Math.max(0, (timer.deadline ?? now) - now);
      timer.deadline = null;
      timer.status = "paused";
    } else if (action === "reset") {
      timer.remainingMs = durationFor(timer.phase, this.snapshot.settings);
      timer.phaseDurationMs = timer.remainingMs;
      timer.status = "idle";
      timer.deadline = null;
    } else if (action === "skip") {
      const phase = timer.phase === "focus" ? "shortBreak" : "focus";
      const duration = durationFor(phase, this.snapshot.settings);
      Object.assign(timer, { phase, status: "idle", deadline: null, remainingMs: duration, phaseDurationMs: duration });
    }
    this.emit();
    return Promise.resolve();
  }

  updateSettings(patch: Partial<Settings>) {
    this.snapshot.settings = { ...this.snapshot.settings, ...patch };
    if (shouldRefreshTimerDuration(this.snapshot.timer.status, this.snapshot.timer.phase, patch)) {
      const duration = durationFor(this.snapshot.timer.phase, this.snapshot.settings);
      this.snapshot.timer.remainingMs = duration;
      this.snapshot.timer.phaseDurationMs = duration;
    }
    this.emit();
    return Promise.resolve();
  }

  addTask(title: string, estimate: number) {
    this.snapshot.tasks.push({ id: crypto.randomUUID(), title, estimate, completed: 0, done: false, position: this.snapshot.tasks.length });
    this.emit();
    return Promise.resolve();
  }

  updateTask(id: string, patch: Partial<Task>) {
    const task = this.snapshot.tasks.find((candidate) => candidate.id === id);
    if (task) Object.assign(task, patch);
    this.emit();
    return Promise.resolve();
  }

  deleteTask(id: string) {
    this.snapshot.tasks = this.snapshot.tasks.filter((task) => task.id !== id);
    if (this.snapshot.timer.activeTaskId === id) this.snapshot.timer.activeTaskId = null;
    this.emit();
    return Promise.resolve();
  }

  activateTask(id: string | null) { this.snapshot.timer.activeTaskId = id; this.emit(); return Promise.resolve(); }
  setMode(mode: WindowMode) { return this.updateSettings({ windowMode: mode }); }
  setPin(pinned: boolean) { return this.updateSettings({ pinned }); }
  openSettings() { window.open(`${location.origin}${location.pathname}?view=settings`, "cozy-settings", "width=840,height=700"); return Promise.resolve(); }
  hide() { return Promise.resolve(); }
  closeSettings() { window.close(); return Promise.resolve(); }
  importAsset(kind: "background" | "sound"): Promise<import("../types").ImportedAsset | null> {
    return new Promise((resolve) => {
      const input = document.createElement("input"); input.type = "file";
      input.accept = kind === "background" ? "image/*,video/*" : "audio/wav,audio/mpeg,audio/ogg";
      input.onchange = () => { const file = input.files?.[0]; resolve(file ? { id: crypto.randomUUID(), name: file.name, kind, path: URL.createObjectURL(file), mime: file.type, size: file.size, mediaType: file.type.startsWith("image/") && file.type !== "image/gif" ? "image" : kind === "background" ? "video" : "audio" } : null); };
      input.click();
    });
  }
}

class NativeBackend {
  getSnapshot() { return invoke<AppSnapshot>("get_app_snapshot"); }
  async subscribe(listener: Listener) {
    const unlisten: UnlistenFn = await listen<AppSnapshot>("app-state", (event) => listener(event.payload));
    let snapshot: AppSnapshot | undefined;
    let lastError: unknown;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        snapshot = await this.getSnapshot();
        break;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => window.setTimeout(resolve, 100));
      }
    }
    if (!snapshot) {
      unlisten();
      throw lastError ?? new Error("Native timer state is unavailable");
    }
    listener(snapshot);
    const unlistenComplete = getCurrentWindow().label === "main"
      ? await listen<string>("phase-completed", async (event) => playCompletionSound((await this.getSnapshot()).settings, event.payload === "focus" ? "focus" : "break"))
      : undefined;
    return () => { unlisten(); unlistenComplete?.(); };
  }
  command(action: "start" | "pause" | "reset" | "skip") { return invoke<void>("timer_command", { action }); }
  updateSettings(patch: Partial<Settings>) { return invoke<void>("update_settings", { patch }); }
  addTask(title: string, estimate: number) { return invoke<void>("add_task", { title, estimate }); }
  updateTask(id: string, patch: Partial<Task>) { return invoke<void>("update_task", { id, patch }); }
  deleteTask(id: string) { return invoke<void>("delete_task", { id }); }
  activateTask(id: string | null) { return invoke<void>("activate_task", { id }); }
  setMode(mode: WindowMode) { return invoke<void>("set_window_mode", { mode }); }
  setPin(pinned: boolean) { return invoke<void>("set_pin", { pinned }); }
  openSettings() { return invoke<void>("open_settings"); }
  hide() { return invoke<void>("hide_main"); }
  closeSettings() { return invoke<void>("close_settings"); }
  async importAsset(kind: "background" | "sound") {
    const selected = await open({ multiple: false, directory: false, filters: [{ name: kind === "background" ? "Background" : "Sound", extensions: kind === "background" ? ["jpg", "jpeg", "png", "webp", "bmp", "tif", "tiff", "avif", "gif", "apng", "mp4", "webm", "mov", "mkv", "avi", "m4v"] : ["wav", "mp3", "ogg"] }] });
    if (typeof selected !== "string") return null;
    return invoke<import("../types").ImportedAsset>("import_asset", { source: selected, kind });
  }
}

// WebView2 may expose Tauri internals a moment after the JavaScript module is
// evaluated. Resolve the backend when a method is used instead of freezing a
// browser fallback for the whole lifetime of the window.
const nativeBackend = new NativeBackend();
const browserBackend = new BrowserBackend();
export const backend = new Proxy(nativeBackend, {
  get(_target, property) {
    const active = isTauri() ? nativeBackend : browserBackend;
    const value = Reflect.get(active, property);
    return typeof value === "function" ? value.bind(active) : value;
  },
});

const BUILTIN_SOUNDS: Record<string, string> = {
  "focus-complete-1": "/sounds/focus-complete-1.wav",
  "focus-complete-2": "/sounds/focus-complete-2.wav",
  "focus-start-1": "/sounds/break-complete-1.wav",
  "focus-start-2": "/sounds/break-complete-2.wav",
};

export function playCompletionSound(settings: Settings, completedPhase: "focus" | "break") {
  if (!settings.soundEnabled) return;
  const customPath = completedPhase === "focus" ? settings.focusCompleteCustomPath : settings.focusStartCustomPath;
  const soundId = completedPhase === "focus" ? settings.focusCompleteSound : settings.focusStartSound;
  const source = customPath
    ? (isTauri() ? convertFileSrc(customPath) : customPath)
    : BUILTIN_SOUNDS[soundId] ?? BUILTIN_SOUNDS[completedPhase === "focus" ? "focus-complete-2" : "focus-start-2"];
  const audio = new Audio(source);
  audio.volume = settings.soundVolume;
  void audio.play().catch(() => undefined);
}
