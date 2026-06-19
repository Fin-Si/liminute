import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, ListTodo, Maximize2, Minimize2, Pause, Pin, PinOff, Play, Plus, RotateCcw, Settings2, SkipForward, Trash2, X } from "lucide-react";
import type { AppSnapshot } from "../lib/bridge";
import { backend } from "../lib/bridge";
import { formatTime } from "../timerCore";
import { phaseLabel, t } from "../i18n";
import type { WindowMode } from "../types";
import { SceneBackground } from "./SceneBackground";
import { getCurrentWindow } from "@tauri-apps/api/window";

export default function TimerWindow({ snapshot }: { snapshot: AppSnapshot }) {
  const { timer, settings, tasks, todaySessions } = snapshot;
  const locale = settings.locale;
  const [taskTitle, setTaskTitle] = useState("");
  const [estimate, setEstimate] = useState(1);
  const mode = settings.windowMode;
  const activeTask = tasks.find((task) => task.id === timer.activeTaskId);
  const scene = timer.phase === "focus" ? settings.focusScene : settings.breakScene;
  const customBackground = timer.phase === "focus" ? settings.focusCustomBackground : settings.breakCustomBackground;
  const customBackgroundId = timer.phase === "focus" ? settings.focusCustomBackgroundId : settings.breakCustomBackgroundId;
  const customMotion = customBackgroundId ? settings.backgroundMotionProfiles[customBackgroundId] : null;
  const progress = Math.min(1, Math.max(0, 1 - timer.remainingMs / Math.max(1, timer.phaseDurationMs)));
  const running = timer.status === "running";

  useEffect(() => {
    document.documentElement.style.setProperty("--window-radius", "0px");
    document.documentElement.style.setProperty("--text-color", settings.textColor);
    document.documentElement.style.setProperty("--accent", settings.accentColor);
    document.documentElement.style.setProperty("--panel-opacity", `${settings.panelOpacity}`);
    document.documentElement.style.setProperty("--font-scale", `${settings.fontScale}`);
    document.title = `${formatTime(timer.remainingMs)} · ${phaseLabel(locale, timer.phase)}`;
  }, [settings, timer.remainingMs, timer.phase, locale]);

  const orderedTasks = useMemo(() => [...tasks].sort((a, b) => Number(a.done) - Number(b.done) || a.position - b.position), [tasks]);

  const addTask = async (event: React.FormEvent) => {
    event.preventDefault();
    const title = taskTitle.trim();
    if (!title) return;
    await backend.addTask(title, estimate);
    setTaskTitle("");
    setEstimate(1);
  };

  const changeMode = async (next: WindowMode) => {
    await backend.setMode(next);
  };
  const toggleDetailMode = () => changeMode(mode === "expanded" ? "compact" : mode === "mini" ? "compact" : "expanded");
  const beginWindowDrag = (event: React.MouseEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, input, select, textarea, a, [role='button']")) return;
    if ("__TAURI_INTERNALS__" in window || window.location.hostname === "tauri.localhost") void getCurrentWindow().startDragging();
  };

  return (
    <main className={`timer-window mode-${mode}`} onMouseDown={beginWindowDrag}>
      <SceneBackground scene={scene} animated={settings.animationsEnabled} overlay={settings.overlay} customUrl={customBackground} motion={customMotion} />

      <header className="titlebar">
        <div className="phase-chip">
          <span className={`status-dot ${running ? "is-running" : ""}`} />
          {phaseLabel(locale, timer.phase)}
        </div>
        <div className="window-actions">
          <button className="icon-button" title={t(locale, "pin")} aria-pressed={settings.pinned} onClick={() => backend.setPin(!settings.pinned)}>
            {settings.pinned ? <Pin size={14} /> : <PinOff size={14} />}
          </button>
          <button className="icon-button" title={t(locale, "settings")} onClick={() => backend.openSettings()}><Settings2 size={15} /></button>
          <button className="icon-button close-button" title="Close" onClick={() => backend.hide()}><X size={16} /></button>
        </div>
      </header>

      <section className="timer-stage">
        <div className={`timer-progress timer-progress--${settings.progressStyle}`} style={{ "--progress": `${progress * 360}deg` } as React.CSSProperties}>
          <div className="timer-readout" aria-live="polite">{formatTime(timer.remainingMs)}</div>
        </div>
        {mode !== "mini" && (
          <button className={`active-task ${activeTask ? "has-task" : ""}`} onClick={() => mode !== "expanded" && changeMode("expanded")}>
            {activeTask ? <><span>{activeTask.title}</span><small>{activeTask.completed}/{activeTask.estimate} 🍅</small></> : <><ListTodo size={14} /><span>{t(locale, "focusHint")}</span></>}
          </button>
        )}
      </section>

      <section className="controls" aria-label="Timer controls">
        <button className="secondary-control" title={t(locale, "reset")} onClick={() => backend.command("reset")}><RotateCcw size={17} /></button>
        <button className="primary-control" aria-label={running ? t(locale, "pause") : timer.status === "paused" ? t(locale, "resume") : t(locale, "start")} onClick={() => backend.command(running ? "pause" : "start")}>
          {running ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" />}
          <span>{running ? t(locale, "pause") : timer.status === "paused" ? t(locale, "resume") : t(locale, "start")}</span>
        </button>
        <button className="secondary-control" title={t(locale, "skip")} onClick={() => backend.command("skip")}><SkipForward size={18} /></button>
      </section>

      {mode === "expanded" && (
        <section className="task-panel">
          <div className="task-panel__heading">
            <div><span>{t(locale, "tasks")}</span><small>{t(locale, "today")}: {todaySessions} {t(locale, "cycles")}</small></div>
            <button className="icon-button" aria-label={t(locale, "windowSize")} title={`${t(locale, "windowSize")}: ${t(locale, "compact")}`} onClick={toggleDetailMode}><Minimize2 size={17} /></button>
          </div>

          <form className="task-form" onSubmit={addTask}>
            <button type="submit" className="task-submit" aria-label={t(locale, "addTask")}><Plus size={17} /></button>
            <input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder={t(locale, "newTask")} maxLength={120} />
            <select value={estimate} onChange={(event) => setEstimate(Number(event.target.value))} aria-label={t(locale, "estimate")}>
              {[1, 2, 3, 4, 5, 6, 8].map((value) => <option key={value} value={value}>{value}×</option>)}
            </select>
          </form>

          <div className="task-list">
            {orderedTasks.length === 0 && <div className="empty-state"><span>☕</span><p>{t(locale, "emptyTasks")}</p></div>}
            {orderedTasks.map((task) => (
              <article key={task.id} className={`task-row ${task.done ? "is-done" : ""} ${task.id === timer.activeTaskId ? "is-active" : ""}`}>
                <button className="task-check" aria-label={t(locale, "done")} onClick={() => backend.updateTask(task.id, { done: !task.done })}>{task.done && <Check size={13} />}</button>
                <button className="task-main" onClick={() => backend.activateTask(task.id === timer.activeTaskId ? null : task.id)}>
                  <span>{task.title}</span><small>{task.completed}/{task.estimate} 🍅</small>
                </button>
                {task.id === timer.activeTaskId ? <ChevronRight className="task-active-icon" size={17} /> : <button className="task-delete" onClick={() => backend.deleteTask(task.id)}><Trash2 size={14} /></button>}
              </article>
            ))}
          </div>
        </section>
      )}

      {mode !== "expanded" && (
        <button className="mode-switch" title={`${t(locale, "windowSize")}: ${t(locale, mode === "mini" ? "compact" : "expanded")}`} onClick={toggleDetailMode} aria-label={t(locale, "windowSize")}><Maximize2 size={14} /></button>
      )}
    </main>
  );
}
