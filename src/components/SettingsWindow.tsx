import { useEffect, useState } from "react";
import { ArrowLeft, Bell, Clock3, Image, MonitorCog, Play, Sparkles } from "lucide-react";
import type { AppSnapshot } from "../lib/bridge";
import { backend, playCompletionSound } from "../lib/bridge";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { t } from "../i18n";
import { DEFAULT_MOTION_PROFILE, type Settings, type WindowMode } from "../types";
import { LIMINUTE_BACKGROUNDS } from "./SceneBackground";
import TimerSurface from "./TimerSurface";

type Section = "timer" | "appearance" | "sounds" | "general";

export default function SettingsWindow({ snapshot }: { snapshot: AppSnapshot }) {
  const [section, setSection] = useState<Section>("timer");
  const settings = snapshot.settings;
  const locale = settings.locale;
  const update = (patch: Partial<Settings>) => backend.updateSettings(patch);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", settings.accentColor);
    document.documentElement.style.setProperty("--text-color", settings.textColor);
    document.documentElement.style.setProperty("--panel-opacity", `${settings.panelOpacity}`);
    document.documentElement.style.setProperty("--font-scale", `${settings.fontScale}`);
  }, [settings.accentColor, settings.textColor, settings.panelOpacity, settings.fontScale]);

  const tabs: { id: Section; icon: typeof Clock3; label: Parameters<typeof t>[1] }[] = [
    { id: "timer", icon: Clock3, label: "timer" },
    { id: "appearance", icon: Image, label: "appearance" },
    { id: "sounds", icon: Bell, label: "sounds" },
    { id: "general", icon: MonitorCog, label: "general" },
  ];

  return (
    <main className="settings-window">
      <aside className="settings-sidebar">
        <div className="brand"><span className="brand-mark"><img src="/brand/liminute-logo.png" alt="" /></span><div><strong>Liminute</strong><small>by FinSi</small></div></div>
        <nav>{tabs.map(({ id, icon: Icon, label }) => <button key={id} data-testid={`settings-tab-${id}`} className={section === id ? "is-active" : ""} onClick={() => setSection(id)}><Icon size={17} /><span>{t(locale, label)}</span></button>)}</nav>
        <button className="back-button" onClick={() => backend.closeSettings()}><ArrowLeft size={16} />{t(locale, "back")}</button>
      </aside>

      <section className="settings-content">
        <header><div><p>{t(locale, "settings")}</p><h1>{t(locale, tabs.find((tab) => tab.id === section)!.label)}</h1></div><span className="save-state">● {t(locale, "save")}</span></header>
        {section === "timer" && <TimerSettings settings={settings} update={update} />}
        {section === "appearance" && <AppearanceSettings snapshot={snapshot} update={update} />}
        {section === "sounds" && <SoundSettings settings={settings} update={update} />}
        {section === "general" && <GeneralSettings settings={settings} update={update} />}
      </section>
    </main>
  );
}

function TimerSettings({ settings, update }: SettingsProps) {
  const l = settings.locale;
  return <div className="settings-stack">
    <div className="settings-card">
      <h2>{t(l, "timer")}</h2><p className="card-description">{l === "ru" ? "Настройте ритм, который не хочется нарушать." : "Set a rhythm that feels natural to keep."}</p>
      <div className="duration-grid">
        <NumberField label={t(l, "focusTime")} value={settings.focusMinutes} suffix="min" onChange={(focusMinutes) => update({ focusMinutes })} />
        <NumberField label={t(l, "shortBreakTime")} value={settings.shortBreakMinutes} suffix="min" onChange={(shortBreakMinutes) => update({ shortBreakMinutes })} />
        <NumberField label={t(l, "longBreakTime")} value={settings.longBreakMinutes} suffix="min" onChange={(longBreakMinutes) => update({ longBreakMinutes })} />
        <NumberField label={t(l, "longAfter")} value={settings.longBreakEvery} suffix="×" onChange={(longBreakEvery) => update({ longBreakEvery })} />
      </div>
    </div>
    <div className="settings-card compact-card">
      <Toggle label={t(l, "autoBreak")} checked={settings.autoStartBreaks} onChange={(autoStartBreaks) => update({ autoStartBreaks })} />
      <Toggle label={t(l, "autoFocus")} checked={settings.autoStartFocus} onChange={(autoStartFocus) => update({ autoStartFocus })} />
    </div>
  </div>;
}

function AppearanceSettings({ snapshot, update }: { snapshot: AppSnapshot; update: (patch: Partial<Settings>) => void }) {
  const settings = snapshot.settings;
  const l = settings.locale;
  const [previewPhase, setPreviewPhase] = useState<"focus" | "break">("focus");
  const [previewMode, setPreviewMode] = useState<WindowMode>(settings.windowMode);
  const customBackground = previewPhase === "focus" ? settings.focusCustomBackground : settings.breakCustomBackground;
  const customBackgroundId = previewPhase === "focus" ? settings.focusCustomBackgroundId : settings.breakCustomBackgroundId;
  const motion = customBackgroundId ? settings.backgroundMotionProfiles[customBackgroundId] ?? DEFAULT_MOTION_PROFILE : DEFAULT_MOTION_PROFILE;
  const isStatic = Boolean(customBackground && /\.(avif|bmp|jpe?g|png|tiff?|webp)($|\?)/i.test(customBackground));
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [importError, setImportError] = useState("");
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window || window.location.hostname === "tauri.localhost")) return;
    let unlisten: UnlistenFn | undefined;
    let cancelled = false;
    void listen<number>("media-import-progress", (event) => setProgress(event.payload)).then((fn) => cancelled ? fn() : unlisten = fn);
    return () => { cancelled = true; unlisten?.(); };
  }, []);
  const importBackground = async () => {
    setImportError(""); setProgress(0); setImporting(true);
    try {
      const asset = await backend.importAsset("background");
      if (!asset) return;
      const profile = asset.mediaType === "image" ? { ...DEFAULT_MOTION_PROFILE } : undefined;
      update(previewPhase === "focus"
        ? { focusCustomBackground: asset.path, focusCustomBackgroundId: asset.id, backgroundMotionProfiles: profile ? { ...settings.backgroundMotionProfiles, [asset.id]: profile } : settings.backgroundMotionProfiles }
        : { breakCustomBackground: asset.path, breakCustomBackgroundId: asset.id, backgroundMotionProfiles: profile ? { ...settings.backgroundMotionProfiles, [asset.id]: profile } : settings.backgroundMotionProfiles });
    } catch (error) { setImportError(error instanceof Error ? error.message : String(error)); }
    finally { setImporting(false); }
  };
  const chooseBuiltin = (item: (typeof LIMINUTE_BACKGROUNDS)[number]) => update(previewPhase === "focus"
    ? { focusCustomBackground: item.path, focusCustomBackgroundId: item.id }
    : { breakCustomBackground: item.path, breakCustomBackgroundId: item.id });
  const updateMotion = (patch: Partial<typeof motion>) => {
    if (!customBackgroundId) return;
    update({ backgroundMotionProfiles: { ...settings.backgroundMotionProfiles, [customBackgroundId]: { ...motion, ...patch } } });
  };
  const previewSize = previewMode === "mini" ? { width: 260, height: 126, scale: 1.35 } : previewMode === "compact" ? { width: 340, height: 210, scale: 1.12 } : { width: 420, height: 580, scale: 0.68 };
  return <div className="appearance-layout">
    <section className="appearance-preview-card settings-card">
      <div className="appearance-section-heading"><div><h2>{t(l, "livePreview")}</h2><p>{t(l, "livePreviewHint")}</p></div><div className="phase-switch" aria-label={t(l, "previewPhase")}><button className={previewPhase === "focus" ? "is-active" : ""} onClick={() => setPreviewPhase("focus")}>{t(l, "focus")}</button><button className={previewPhase === "break" ? "is-active" : ""} onClick={() => setPreviewPhase("break")}>{t(l, "shortBreak")}</button></div></div>
      <div className="preview-mode-switch" aria-label={t(l, "previewSize")}>
        {(["mini", "compact", "expanded"] as WindowMode[]).map((mode) => <button key={mode} className={previewMode === mode ? "is-active" : ""} onClick={() => setPreviewMode(mode)}><span>{t(l, mode)}</span><small>{mode === "mini" ? "260 × 126" : mode === "compact" ? "340 × 210" : "420 × 580"}</small></button>)}
      </div>
      <div className={`widget-preview-canvas is-${previewMode}`} style={{ height: previewSize.height * previewSize.scale + 34 }}>
        <div className="widget-preview-viewport" style={{ width: previewSize.width * previewSize.scale, height: previewSize.height * previewSize.scale }}>
          <div className="widget-preview-scale" style={{ width: previewSize.width, height: previewSize.height, transform: `scale(${previewSize.scale})` }}>
            <TimerSurface snapshot={snapshot} mode={previewMode} phase={previewPhase === "focus" ? "focus" : "shortBreak"} interactive={false} />
          </div>
        </div>
      </div>
    </section>

    <section className="settings-card collection-card">
      <div className="appearance-section-heading"><div><h2><Sparkles size={17} /> {t(l, "liminuteCollection")}</h2><p>{t(l, "collectionHint")}</p></div></div>
      <label className="field-label">{t(l, previewPhase === "focus" ? "focusBackground" : "breakBackground")}</label>
      <div className="scene-grid scene-grid--collection">{LIMINUTE_BACKGROUNDS.map((item) => <button key={item.id} className={customBackgroundId === item.id ? "is-active" : ""} onClick={() => chooseBuiltin(item)} aria-label={item.name}><span className={item.mediaType === "video" ? "is-video" : ""} style={{ backgroundImage: `url(${item.poster})` }}>{item.mediaType === "video" ? <i><Play size={13} fill="currentColor" /></i> : null}</span><small>{item.name}</small></button>)}</div>
      <div className="collection-actions">
        <button className="import-button" disabled={importing} onClick={importBackground}>{importing ? `${t(l, "converting")} ${progress}%` : t(l, "import")}</button>
        <Toggle label={t(l, "motion")} checked={settings.animationsEnabled} onChange={(animationsEnabled) => update({ animationsEnabled })} />
      </div>
      {importError && <p className="import-error" role="alert">{importError}</p>}
    </section>

    <section className={`customization-grid ${isStatic && customBackgroundId ? "has-motion" : ""}`}>
      {isStatic && customBackgroundId && <div className="settings-card range-card motion-card">
        <h2><Sparkles size={17} />{t(l, "imageMotion")}</h2>
        <p className="card-description">{t(l, "imageMotionHint")}</p>
        <Toggle label={t(l, "imageMotion")} checked={motion.enabled} onChange={(enabled) => updateMotion({ enabled })} />
        <RangeField label={t(l, "motionScale")} value={motion.scale} min={0} max={0.1} step={0.005} displayValue={`${Math.round(motion.scale * 100)}%`} onChange={(scale) => updateMotion({ scale })} />
        <RangeField label={t(l, "motionSpeed")} value={motion.speed} min={6} max={30} step={1} displayValue={`${motion.speed}s`} onChange={(speed) => updateMotion({ speed })} />
        <RangeField label={t(l, "motionDrift")} value={motion.drift} min={0} max={0.05} step={0.005} displayValue={`${Math.round(motion.drift * 100)}%`} onChange={(drift) => updateMotion({ drift })} />
      </div>}
      <div className="settings-card range-card visual-card">
        <h2>{t(l, "visualTuning")}</h2>
        <p className="card-description">{t(l, "visualTuningHint")}</p>
        <RangeField label={t(l, "overlay")} value={settings.overlay} min={0} max={0.75} step={0.01} onChange={(overlay) => update({ overlay })} />
        <RangeField label={t(l, "panelOpacity")} value={settings.panelOpacity} min={0.05} max={0.65} step={0.01} onChange={(panelOpacity) => update({ panelOpacity })} />
        <RangeField label={t(l, "scale")} value={settings.fontScale} min={0.8} max={1.25} step={0.01} onChange={(fontScale) => update({ fontScale })} />
        <div className="color-row"><label>{l === "ru" ? "Акцент" : "Accent"}<input type="color" value={settings.accentColor} onChange={(e) => update({ accentColor: e.target.value })} /></label><label>{l === "ru" ? "Текст" : "Text"}<input type="color" value={settings.textColor} onChange={(e) => update({ textColor: e.target.value })} /></label></div>
      </div>
    </section>
  </div>;
}

function SoundSettings({ settings, update }: SettingsProps) {
  const l = settings.locale;
  const focusSounds = [
    { id: "focus-complete-2", label: l === "ru" ? "Светлый гонг" : "Bright chime", primary: true },
    { id: "focus-complete-1", label: l === "ru" ? "Глубокий гонг" : "Deep chime" },
  ];
  const startSounds = [
    { id: "focus-start-2", label: l === "ru" ? "Короткий старт" : "Quick return", primary: true },
    { id: "focus-start-1", label: l === "ru" ? "Мягкий старт" : "Soft return" },
  ];
  const importSound = async (phase: "focus" | "break") => {
    const asset = await backend.importAsset("sound");
    if (!asset) return;
    update(phase === "focus"
      ? { focusCompleteCustomPath: asset.path, focusCompleteSound: asset.id }
      : { focusStartCustomPath: asset.path, focusStartSound: asset.id });
  };
  return <div className="settings-stack sound-settings">
    <div className="settings-card sound-master">
      <Toggle label={t(l, "sound")} checked={settings.soundEnabled} onChange={(soundEnabled) => update({ soundEnabled })} />
      <p className="card-description">{t(l, "soundHint")}</p>
      <RangeField label={t(l, "volume")} value={settings.soundVolume} min={0} max={1} step={0.01} onChange={(soundVolume) => update({ soundVolume })} />
    </div>
    <SoundGroup title={t(l, "focusCompleteSound")} options={focusSounds} selected={settings.focusCompleteSound} custom={settings.focusCompleteCustomPath} onSelect={(focusCompleteSound) => update({ focusCompleteSound, focusCompleteCustomPath: null })} onPreview={() => playCompletionSound(settings, "focus")} onImport={() => importSound("focus")} importLabel={t(l, "import")} previewLabel={t(l, "preview")} primaryLabel={t(l, "primary")} />
    <SoundGroup title={t(l, "focusStartSound")} options={startSounds} selected={settings.focusStartSound} custom={settings.focusStartCustomPath} onSelect={(focusStartSound) => update({ focusStartSound, focusStartCustomPath: null })} onPreview={() => playCompletionSound(settings, "break")} onImport={() => importSound("break")} importLabel={t(l, "import")} previewLabel={t(l, "preview")} primaryLabel={t(l, "primary")} />
  </div>;
}

function SoundGroup({ title, options, selected, custom, onSelect, onPreview, onImport, importLabel, previewLabel, primaryLabel }: { title: string; options: { id: string; label: string; primary?: boolean }[]; selected: string; custom: string | null; onSelect: (id: string) => void; onPreview: () => void; onImport: () => void; importLabel: string; previewLabel: string; primaryLabel: string }) {
  return <div className="settings-card sound-group">
    <h2><Bell size={18} />{title}</h2>
    <div className="sound-options">{options.map((option, index) => <button className={`${!custom && selected === option.id ? "is-active" : ""} ${option.primary ? "is-primary" : ""}`} onClick={() => onSelect(option.id)} key={option.id}>{option.primary && <em>{primaryLabel}</em>}<span className="sound-number">{index + 1}</span><strong>{option.label}</strong></button>)}</div>
    {custom && <div className="custom-sound-chip">{custom.split(/[\\/]/).pop()}</div>}
    <div className="sound-actions"><button className="preview-sound" onClick={onPreview}><Play size={15} fill="currentColor" />{previewLabel}</button><button className="import-button" onClick={onImport}>{importLabel}</button></div>
  </div>;
}

function GeneralSettings({ settings, update }: SettingsProps) {
  const l = settings.locale;
  const presets: { id: Settings["windowMode"]; label: "mini" | "compact" | "expanded"; size: string }[] = [
    { id: "mini", label: "mini", size: "260 × 126" },
    { id: "compact", label: "compact", size: "340 × 210" },
    { id: "expanded", label: "expanded", size: "420 × 580" },
  ];
  return <div className="settings-stack">
    <div className="settings-card">
      <h2>{t(l, "windowSize")}</h2><p className="card-description">{t(l, "windowSizeHint")}</p>
      <div className="preset-grid">{presets.map((preset) => <button key={preset.id} className={settings.windowMode === preset.id ? "is-active" : ""} onClick={() => backend.setMode(preset.id)}><i className={`preset-shape preset-shape--${preset.id}`} /><strong>{t(l, preset.label)}</strong><small>{preset.size}</small></button>)}</div>
    </div>
    <div className="settings-card compact-card">
      <div className="select-row"><label>{t(l, "language")}</label><select value={settings.locale} onChange={(event) => update({ locale: event.target.value as Settings["locale"] })}><option value="ru">Русский</option><option value="en">English</option></select></div>
      <Toggle label={t(l, "autostart")} checked={settings.autostart} onChange={(autostart) => update({ autostart })} />
      <Toggle label={t(l, "startMinimized")} checked={settings.startMinimized} onChange={(startMinimized) => update({ startMinimized })} />
      <Toggle label={t(l, "pin")} checked={settings.pinned} onChange={(pinned) => backend.setPin(pinned)} />
    </div>
    <div className="about-card"><span><img src="/brand/liminute-logo.png" alt="" /></span><div><strong>Liminute</strong><p>by FinSi · Version 0.4.2 · Local-first</p></div></div>
  </div>;
}

interface SettingsProps { settings: Settings; update: (patch: Partial<Settings>) => void }
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) { return <label className="toggle-row"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i /></label>; }
function NumberField({ label, value, suffix, onChange }: { label: string; value: number; suffix: string; onChange: (value: number) => void }) { return <label className="number-field"><span>{label}</span><div><input type="number" min={1} max={180} value={value} onChange={(event) => onChange(Math.max(1, Number(event.target.value)))} /><small>{suffix}</small></div></label>; }
function RangeField({ label, value, min, max, step, onChange, displayValue }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void; displayValue?: string }) { return <label className="range-field"><span>{label}<b>{displayValue ?? (step >= 1 ? value : Math.round(value * 100))}</b></span><input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></label>; }
