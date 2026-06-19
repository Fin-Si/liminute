import { useMemo, useState } from "react";
import { Check, ChevronRight, ListTodo, Maximize2, Minimize2, Pause, Pin, PinOff, Play, Plus, RotateCcw, Settings2, SkipForward, Trash2, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AppSnapshot } from "../lib/bridge";
import { backend } from "../lib/bridge";
import { formatTime } from "../timerCore";
import { phaseLabel, t } from "../i18n";
import type { Phase, WindowMode } from "../types";
import { SceneBackground } from "./SceneBackground";

interface TimerSurfaceProps {
  snapshot: AppSnapshot;
  mode?: WindowMode;
  phase?: Extract<Phase, "focus" | "shortBreak">;
  interactive?: boolean;
}

export default function TimerSurface({ snapshot, mode: modeOverride, phase: phaseOverride, interactive = true }: TimerSurfaceProps) {
  const { settings, tasks, todaySessions } = snapshot;
  const locale = settings.locale;
  const mode = modeOverride ?? settings.windowMode;
  const [taskTitle, setTaskTitle] = useState("");
  const [estimate, setEstimate] = useState(1);
  const phase = phaseOverride ?? snapshot.timer.phase;
  const previewDuration = phase === "focus" ? settings.focusMinutes * 60_000 : settings.shortBreakMinutes * 60_000;
  const timer = phaseOverride ? { ...snapshot.timer, phase, status: "idle" as const, deadline: null, remainingMs: previewDuration, phaseDurationMs: previewDuration } : snapshot.timer;
  const customBackground = phase === "focus" ? settings.focusCustomBackground : settings.breakCustomBackground;
  const customBackgroundId = phase === "focus" ? settings.focusCustomBackgroundId : settings.breakCustomBackgroundId;
  const customMotion = customBackgroundId ? settings.backgroundMotionProfiles[customBackgroundId] : null;
  const activeTask = tasks.find((task) => task.id === timer.activeTaskId);
  const orderedTasks = useMemo(() => [...tasks].sort((a, b) => Number(a.done) - Number(b.done) || a.position - b.position), [tasks]);
  const progress = Math.min(1, Math.max(0, 1 - timer.remainingMs / Math.max(1, timer.phaseDurationMs)));
  const running = timer.status === "running";
  const inertProps = interactive ? {} : { tabIndex: -1, "aria-hidden": true };

  const addTask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!interactive) return;
    const title = taskTitle.trim();
    if (!title) return;
    await backend.addTask(title, estimate);
    setTaskTitle("");
    setEstimate(1);
  };
  const changeMode = async (next: WindowMode) => { if (interactive) await backend.setMode(next); };
  const toggleDetailMode = () => changeMode(mode === "expanded" ? "compact" : mode === "mini" ? "compact" : "expanded");
  const beginWindowDrag = (event: React.MouseEvent<HTMLElement>) => {
    if (!interactive || event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, input, select, textarea, a, [role='button']")) return;
    if ("__TAURI_INTERNALS__" in window || window.location.hostname === "tauri.localhost") void getCurrentWindow().startDragging();
  };

  return <main className={`timer-window mode-${mode} ${interactive ? "" : "is-preview"}`} onMouseDown={beginWindowDrag}>
    <SceneBackground animated={settings.animationsEnabled} overlay={settings.overlay} customUrl={customBackground} motion={customMotion} />

    <header className="titlebar">
      <div className="phase-chip"><span className={`status-dot ${running ? "is-running" : ""}`} />{phaseLabel(locale, phase)}</div>
      <div className="window-actions">
        <button className="icon-button" title={t(locale, "pin")} aria-pressed={settings.pinned} onClick={interactive ? () => backend.setPin(!settings.pinned) : undefined} {...inertProps}>{settings.pinned ? <Pin size={14} /> : <PinOff size={14} />}</button>
        <button className="icon-button" title={t(locale, "settings")} onClick={interactive ? () => backend.openSettings() : undefined} {...inertProps}><Settings2 size={15} /></button>
        <button className="icon-button close-button" title="Close" onClick={interactive ? () => backend.hide() : undefined} {...inertProps}><X size={16} /></button>
      </div>
    </header>

    <section className="timer-stage">
      <div className={`timer-progress timer-progress--${settings.progressStyle}`} style={{ "--progress": `${progress * 360}deg` } as React.CSSProperties}>
        <div className="timer-readout" aria-live={interactive ? "polite" : "off"}>{formatTime(timer.remainingMs)}</div>
      </div>
      {mode !== "mini" && <button className={`active-task ${activeTask ? "has-task" : ""}`} onClick={interactive && mode !== "expanded" ? () => changeMode("expanded") : undefined} {...inertProps}>
        {activeTask ? <><span>{activeTask.title}</span><small>{activeTask.completed}/{activeTask.estimate} 🍅</small></> : <><ListTodo size={14} /><span>{t(locale, "focusHint")}</span></>}
      </button>}
    </section>

    <section className="controls" aria-label={interactive ? "Timer controls" : undefined}>
      <button className="secondary-control" title={t(locale, "reset")} onClick={interactive ? () => backend.command("reset") : undefined} {...inertProps}><RotateCcw size={17} /></button>
      <button className="primary-control" aria-label={running ? t(locale, "pause") : timer.status === "paused" ? t(locale, "resume") : t(locale, "start")} onClick={interactive ? () => backend.command(running ? "pause" : "start") : undefined} {...inertProps}>
        {running ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" />}<span>{running ? t(locale, "pause") : timer.status === "paused" ? t(locale, "resume") : t(locale, "start")}</span>
      </button>
      <button className="secondary-control" title={t(locale, "skip")} onClick={interactive ? () => backend.command("skip") : undefined} {...inertProps}><SkipForward size={18} /></button>
    </section>

    {mode === "expanded" && <section className="task-panel">
      <div className="task-panel__heading"><div><span>{t(locale, "tasks")}</span><small>{t(locale, "today")}: {todaySessions} {t(locale, "cycles")}</small></div><button className="icon-button" aria-label={t(locale, "windowSize")} title={`${t(locale, "windowSize")}: ${t(locale, "compact")}`} onClick={interactive ? toggleDetailMode : undefined} {...inertProps}><Minimize2 size={17} /></button></div>
      <form className="task-form" onSubmit={addTask}>
        <button type="submit" className="task-submit" aria-label={t(locale, "addTask")} {...inertProps}><Plus size={17} /></button>
        <input value={taskTitle} readOnly={!interactive} onChange={(event) => setTaskTitle(event.target.value)} placeholder={t(locale, "newTask")} maxLength={120} {...inertProps} />
        <select value={estimate} disabled={!interactive} onChange={(event) => setEstimate(Number(event.target.value))} aria-label={t(locale, "estimate")} {...inertProps}>{[1, 2, 3, 4, 5, 6, 8].map((value) => <option key={value} value={value}>{value}×</option>)}</select>
      </form>
      <div className="task-list">
        {orderedTasks.length === 0 && <div className="empty-state"><span>☕</span><p>{t(locale, "emptyTasks")}</p></div>}
        {orderedTasks.map((task) => <article key={task.id} className={`task-row ${task.done ? "is-done" : ""} ${task.id === timer.activeTaskId ? "is-active" : ""}`}>
          <button className="task-check" aria-label={t(locale, "done")} onClick={interactive ? () => backend.updateTask(task.id, { done: !task.done }) : undefined} {...inertProps}>{task.done && <Check size={13} />}</button>
          <button className="task-main" onClick={interactive ? () => backend.activateTask(task.id === timer.activeTaskId ? null : task.id) : undefined} {...inertProps}><span>{task.title}</span><small>{task.completed}/{task.estimate} 🍅</small></button>
          {task.id === timer.activeTaskId ? <ChevronRight className="task-active-icon" size={17} /> : <button className="task-delete" onClick={interactive ? () => backend.deleteTask(task.id) : undefined} {...inertProps}><Trash2 size={14} /></button>}
        </article>)}
      </div>
    </section>}

    {mode !== "expanded" && <button className="mode-switch" title={`${t(locale, "windowSize")}: ${t(locale, mode === "mini" ? "compact" : "expanded")}`} onClick={interactive ? toggleDetailMode : undefined} aria-label={t(locale, "windowSize")} {...inertProps}><Maximize2 size={14} /></button>}
  </main>;
}
