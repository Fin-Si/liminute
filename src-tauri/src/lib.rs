use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::Mutex,
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, LogicalSize, Manager, State, WebviewWindow, WindowEvent,
};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_shell::ShellExt;
use uuid::Uuid;

#[cfg(target_os = "windows")]
fn set_windows_app_user_model_id() {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    let app_id: Vec<u16> = OsStr::new("com.simon.liminute")
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    extern "system" {
        fn SetCurrentProcessExplicitAppUserModelID(appID: *const u16) -> i32;
    }

    unsafe {
        SetCurrentProcessExplicitAppUserModelID(app_id.as_ptr());
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TimerState {
    phase: String,
    status: String,
    deadline: Option<i64>,
    remaining_ms: i64,
    phase_duration_ms: i64,
    completed_in_cycle: i64,
    active_task_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
struct Settings {
    locale: String,
    focus_minutes: i64,
    short_break_minutes: i64,
    long_break_minutes: i64,
    long_break_every: i64,
    auto_start_breaks: bool,
    auto_start_focus: bool,
    autostart: bool,
    start_minimized: bool,
    pinned: bool,
    window_mode: String,
    focus_scenes: Vec<String>,
    break_scenes: Vec<String>,
    focus_scene: String,
    break_scene: String,
    focus_custom_background: Option<String>,
    break_custom_background: Option<String>,
    focus_custom_background_id: Option<String>,
    break_custom_background_id: Option<String>,
    background_motion_profiles: HashMap<String, BackgroundMotionProfile>,
    shuffle_scenes: bool,
    animations_enabled: bool,
    overlay: f64,
    text_color: String,
    accent_color: String,
    font_scale: f64,
    radius: i64,
    panel_opacity: f64,
    progress_style: String,
    sound_enabled: bool,
    sound_volume: f64,
    sound_id: String,
    custom_sound_path: Option<String>,
    focus_complete_sound: String,
    #[serde(alias = "breakCompleteSound")]
    focus_start_sound: String,
    focus_complete_custom_path: Option<String>,
    #[serde(alias = "breakCompleteCustomPath")]
    focus_start_custom_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackgroundMotionProfile {
    enabled: bool,
    scale: f64,
    speed: f64,
    drift: f64,
}

impl Default for BackgroundMotionProfile {
    fn default() -> Self { Self { enabled: false, scale: 0.03, speed: 18.0, drift: 0.01 } }
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            locale: "en".into(), focus_minutes: 25, short_break_minutes: 5,
            long_break_minutes: 15, long_break_every: 4, auto_start_breaks: false,
            auto_start_focus: false, autostart: false, start_minimized: false,
            pinned: false, window_mode: "compact".into(),
            focus_scenes: vec!["rainy-room".into(), "forest".into(), "night-city".into(), "pixel-night".into()],
            break_scenes: vec!["ember".into(), "ocean".into(), "aurora".into(), "sunrise".into()],
            focus_scene: "rainy-room".into(), break_scene: "ember".into(), shuffle_scenes: false,
            focus_custom_background: Some("/backgrounds/liminute/motion-06.webm".into()),
            break_custom_background: Some("/backgrounds/liminute/motion-01.webm".into()),
            focus_custom_background_id: Some("liminute-motion-6".into()),
            break_custom_background_id: Some("liminute-motion-1".into()),
            background_motion_profiles: HashMap::new(),
            animations_enabled: true, overlay: 0.36, text_color: "#F6EAD2".into(),
            accent_color: "#EAD0A0".into(), font_scale: 1.0, radius: 24,
            panel_opacity: 0.18, progress_style: "ring".into(), sound_enabled: true,
            sound_volume: 0.7, sound_id: "chime".into(),
            custom_sound_path: None,
            focus_complete_sound: "focus-complete-2".into(),
            focus_start_sound: "focus-start-2".into(),
            focus_complete_custom_path: None,
            focus_start_custom_path: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Task {
    id: String,
    title: String,
    estimate: i64,
    completed: i64,
    done: bool,
    position: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FocusSession {
    id: String,
    task_id: Option<String>,
    started_at: i64,
    completed_at: i64,
    duration_seconds: i64,
    completed: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportedAsset {
    id: String,
    name: String,
    kind: String,
    path: String,
    mime: String,
    size: u64,
    media_type: String,
    width: Option<u32>,
    height: Option<u32>,
    duration_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppSnapshot {
    timer: TimerState,
    settings: Settings,
    tasks: Vec<Task>,
    today_sessions: usize,
}

#[derive(Debug, Serialize, Deserialize)]
struct PersistedState {
    settings: Settings,
    timer: TimerState,
}

struct RuntimeData {
    settings: Settings,
    timer: TimerState,
    tasks: Vec<Task>,
    sessions: Vec<FocusSession>,
}

struct AppState {
    inner: Mutex<RuntimeData>,
    state_path: PathBuf,
    db_path: PathBuf,
}

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as i64
}

fn locale_from_tag(tag: Option<&str>) -> String {
    match tag {
        Some(value) => {
            let t = value.to_ascii_lowercase();
            if t.starts_with("ru") { "ru".into() }
            else if t.starts_with("zh") { "zh".into() }
            else if t.starts_with("es") { "es".into() }
            else if t.starts_with("fr") { "fr".into() }
            else if t.starts_with("de") { "de".into() }
            else if t.starts_with("ja") { "ja".into() }
            else if t.starts_with("pt") { "pt".into() }
            else if t.starts_with("ko") { "ko".into() }
            else if t.starts_with("it") { "it".into() }
            else if t.starts_with("pl") { "pl".into() }
            else if t.starts_with("nl") { "nl".into() }
            else { "en".into() }
        }
        None => "en".into(),
    }
}

fn ensure_liminute_background_defaults(settings: &mut Settings) {
    if settings.focus_custom_background.is_none() {
        settings.focus_custom_background = Some("/backgrounds/liminute/motion-06.webm".into());
        settings.focus_custom_background_id = Some("liminute-motion-6".into());
    }
    if settings.break_custom_background.is_none() {
        settings.break_custom_background = Some("/backgrounds/liminute/motion-01.webm".into());
        settings.break_custom_background_id = Some("liminute-motion-1".into());
    }
}

fn duration_for(phase: &str, settings: &Settings) -> i64 {
    let minutes = match phase {
        "focus" => settings.focus_minutes,
        "longBreak" => settings.long_break_minutes,
        _ => settings.short_break_minutes,
    };
    minutes.max(1) * 60_000
}

fn window_dimensions(mode: &str) -> (f64, f64) {
    match mode {
        "mini" => (260.0, 126.0),
        "expanded" => (420.0, 580.0),
        _ => (340.0, 210.0),
    }
}

fn apply_window_preset(window: &WebviewWindow, mode: &str) -> Result<(), String> {
    let (width, height) = window_dimensions(mode);
    window.set_resizable(false).map_err(|e| e.to_string())?;
    window.set_size(LogicalSize::new(width, height)).map_err(|e| e.to_string())
}

fn initial_timer(settings: &Settings) -> TimerState {
    let duration = duration_for("focus", settings);
    TimerState { phase: "focus".into(), status: "idle".into(), deadline: None,
        remaining_ms: duration, phase_duration_ms: duration, completed_in_cycle: 0, active_task_id: None }
}

fn refresh_inactive_timer_duration(data: &mut RuntimeData) {
    if data.timer.status == "idle" || data.timer.status == "awaiting" {
        let duration = duration_for(&data.timer.phase, &data.settings);
        data.timer.remaining_ms = duration;
        data.timer.phase_duration_ms = duration;
        data.timer.deadline = None;
    }
}

fn refresh_timer_after_settings_change(data: &mut RuntimeData, old_duration: i64) {
    let duration = duration_for(&data.timer.phase, &data.settings);
    if (data.timer.status == "idle" || data.timer.status == "awaiting") && duration != old_duration {
        data.timer.remaining_ms = duration;
        data.timer.phase_duration_ms = duration;
        data.timer.deadline = None;
    }
}

fn snapshot(data: &RuntimeData) -> AppSnapshot {
    let today = day_number(now_ms());
    AppSnapshot {
        timer: data.timer.clone(), settings: data.settings.clone(), tasks: data.tasks.clone(),
        today_sessions: data.sessions.iter().filter(|s| s.completed && day_number(s.completed_at) == today).count(),
    }
}

fn day_number(timestamp: i64) -> i64 { timestamp / 86_400_000 }

fn persist(state: &AppState, data: &RuntimeData) -> Result<(), String> {
    let persisted = PersistedState { settings: data.settings.clone(), timer: data.timer.clone() };
    let json = serde_json::to_vec_pretty(&persisted).map_err(|e| e.to_string())?;
    fs::write(&state.state_path, json).map_err(|e| e.to_string())?;
    let mut conn = Connection::open(&state.db_path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM tasks", []).map_err(|e| e.to_string())?;
    for task in &data.tasks {
        tx.execute("INSERT INTO tasks(id,title,estimate,completed,done,position) VALUES(?1,?2,?3,?4,?5,?6)",
            params![task.id, task.title, task.estimate, task.completed, task.done, task.position]).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

fn emit_state(app: &AppHandle, state: &AppState, persist_first: bool) {
    if let Ok(data) = state.inner.lock() {
        if persist_first { let _ = persist(state, &data); }
        let _ = app.emit("app-state", snapshot(&data));
    }
}

fn next_after_completion(data: &mut RuntimeData, now: i64, allow_auto: bool) -> Option<FocusSession> {
    let was_focus = data.timer.phase == "focus";
    let mut session = None;
    if was_focus {
        let created = FocusSession {
            id: Uuid::new_v4().to_string(), task_id: data.timer.active_task_id.clone(),
            started_at: now - data.timer.phase_duration_ms, completed_at: now,
            duration_seconds: data.timer.phase_duration_ms / 1000, completed: true,
        };
        if let Some(task_id) = &data.timer.active_task_id {
            if let Some(task) = data.tasks.iter_mut().find(|task| &task.id == task_id) { task.completed += 1; }
        }
        data.timer.completed_in_cycle += 1;
        session = Some(created.clone());
        data.sessions.push(created);
    }
    let next = if was_focus {
        if data.timer.completed_in_cycle >= data.settings.long_break_every { "longBreak" } else { "shortBreak" }
    } else { "focus" };
    if data.timer.phase == "longBreak" { data.timer.completed_in_cycle = 0; }
    let duration = duration_for(next, &data.settings);
    let auto = allow_auto && if next == "focus" { data.settings.auto_start_focus } else { data.settings.auto_start_breaks };
    data.timer.phase = next.into();
    data.timer.status = if auto { "running" } else { "awaiting" }.into();
    data.timer.deadline = if auto { Some(now + duration) } else { None };
    data.timer.remaining_ms = duration;
    data.timer.phase_duration_ms = duration;
    session
}

fn insert_session(path: &PathBuf, session: &FocusSession) {
    if let Ok(conn) = Connection::open(path) {
        let _ = conn.execute("INSERT OR IGNORE INTO sessions(id,task_id,started_at,completed_at,duration_seconds,completed) VALUES(?1,?2,?3,?4,?5,?6)",
            params![session.id, session.task_id, session.started_at, session.completed_at, session.duration_seconds, session.completed]);
    }
}

fn start_timer_loop(app: AppHandle) {
    thread::spawn(move || {
        let mut last_emit = 0_i64;
        loop {
            thread::sleep(Duration::from_millis(250));
            let Some(state) = app.try_state::<AppState>() else { continue };
            let now = now_ms();
            let mut completed_phase: Option<String> = None;
            let mut changed = false;
            if let Ok(mut data) = state.inner.lock() {
                if data.timer.status == "running" {
                    if let Some(deadline) = data.timer.deadline {
                        let remaining = (deadline - now).max(0);
                        data.timer.remaining_ms = remaining;
                        if remaining == 0 {
                            let finished_phase = data.timer.phase.clone();
                            let lateness = now - deadline;
                            if let Some(session) = next_after_completion(&mut data, now, lateness < 10_000) {
                                insert_session(&state.db_path, &session);
                            }
                            completed_phase = Some(finished_phase);
                            changed = true;
                        } else if now - last_emit >= 500 { changed = true; }
                    }
                }
                if changed {
                    last_emit = now;
                    let _ = persist(&state, &data);
                    let _ = app.emit("app-state", snapshot(&data));
                }
            }
            if let Some(phase) = completed_phase {
                let message = if phase == "focus" { "Фокус завершён — время отдохнуть" } else { "Отдых завершён — возвращаемся к фокусу" };
                let _ = app.notification().builder().title("Liminute").body(message).show();
                let _ = app.emit("phase-completed", phase);
            }
        }
    });
}

fn merge_patch<T: Serialize + for<'de> Deserialize<'de>>(current: &T, patch: Value) -> Result<T, String> {
    let mut base = serde_json::to_value(current).map_err(|e| e.to_string())?;
    let Value::Object(patch_map) = patch else { return Err("Patch must be an object".into()) };
    let Value::Object(base_map) = &mut base else { return Err("Invalid stored value".into()) };
    for (key, value) in patch_map { base_map.insert(key, value); }
    serde_json::from_value(base).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_app_snapshot(state: State<AppState>) -> Result<AppSnapshot, String> {
    state.inner.lock().map(|data| snapshot(&data)).map_err(|_| "State lock poisoned".into())
}

#[tauri::command]
fn timer_command(app: AppHandle, state: State<AppState>, action: String) -> Result<(), String> {
    let now = now_ms();
    {
        let mut data = state.inner.lock().map_err(|_| "State lock poisoned")?;
        match action.as_str() {
            "start" => { data.timer.status = "running".into(); data.timer.deadline = Some(now + data.timer.remaining_ms); }
            "pause" if data.timer.status == "running" => {
                data.timer.remaining_ms = (data.timer.deadline.unwrap_or(now) - now).max(0);
                data.timer.deadline = None; data.timer.status = "paused".into();
            }
            "reset" => {
                let duration = duration_for(&data.timer.phase, &data.settings);
                data.timer.remaining_ms = duration; data.timer.phase_duration_ms = duration;
                data.timer.deadline = None; data.timer.status = "idle".into();
            }
            "skip" => {
                let next = if data.timer.phase == "focus" { "shortBreak" } else { "focus" };
                let duration = duration_for(next, &data.settings);
                data.timer.phase = next.into(); data.timer.status = "idle".into(); data.timer.deadline = None;
                data.timer.remaining_ms = duration; data.timer.phase_duration_ms = duration;
            }
            _ => {}
        }
        persist(&state, &data)?;
    }
    emit_state(&app, &state, false);
    Ok(())
}

#[tauri::command]
fn update_settings(app: AppHandle, state: State<AppState>, patch: Value) -> Result<(), String> {
    let (old_autostart, new_autostart);
    {
        let mut data = state.inner.lock().map_err(|_| "State lock poisoned")?;
        old_autostart = data.settings.autostart;
        let old_duration = duration_for(&data.timer.phase, &data.settings);
        data.settings = merge_patch(&data.settings, patch)?;
        new_autostart = data.settings.autostart;
        refresh_timer_after_settings_change(&mut data, old_duration);
        persist(&state, &data)?;
    }
    if old_autostart != new_autostart {
        if new_autostart { app.autolaunch().enable().map_err(|e| e.to_string())?; }
        else { app.autolaunch().disable().map_err(|e| e.to_string())?; }
    }
    emit_state(&app, &state, false);
    Ok(())
}

#[tauri::command]
fn add_task(app: AppHandle, state: State<AppState>, title: String, estimate: i64) -> Result<(), String> {
    let mut data = state.inner.lock().map_err(|_| "State lock poisoned")?;
    let position = data.tasks.len() as i64;
    data.tasks.push(Task { id: Uuid::new_v4().to_string(), title: title.trim().to_string(), estimate: estimate.max(1), completed: 0, done: false, position });
    persist(&state, &data)?; let snap = snapshot(&data); drop(data); app.emit("app-state", snap).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_task(app: AppHandle, state: State<AppState>, id: String, patch: Value) -> Result<(), String> {
    let mut data = state.inner.lock().map_err(|_| "State lock poisoned")?;
    if let Some(index) = data.tasks.iter().position(|task| task.id == id) {
        data.tasks[index] = merge_patch(&data.tasks[index], patch)?;
    }
    persist(&state, &data)?; let snap = snapshot(&data); drop(data); app.emit("app-state", snap).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_task(app: AppHandle, state: State<AppState>, id: String) -> Result<(), String> {
    let mut data = state.inner.lock().map_err(|_| "State lock poisoned")?;
    data.tasks.retain(|task| task.id != id);
    if data.timer.active_task_id.as_ref() == Some(&id) { data.timer.active_task_id = None; }
    persist(&state, &data)?; let snap = snapshot(&data); drop(data); app.emit("app-state", snap).map_err(|e| e.to_string())
}

#[tauri::command]
fn activate_task(app: AppHandle, state: State<AppState>, id: Option<String>) -> Result<(), String> {
    let mut data = state.inner.lock().map_err(|_| "State lock poisoned")?;
    data.timer.active_task_id = id; persist(&state, &data)?; let snap = snapshot(&data); drop(data);
    app.emit("app-state", snap).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_window_mode(app: AppHandle, state: State<AppState>, mode: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        apply_window_preset(&window, &mode)?;
    }
    update_settings(app, state, serde_json::json!({ "windowMode": mode }))
}

#[tauri::command]
fn set_pin(app: AppHandle, state: State<AppState>, pinned: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.set_always_on_top(pinned).map_err(|e| e.to_string())?;
        let applied = window.is_always_on_top().map_err(|e| e.to_string())?;
        if applied != pinned { return Err("Windows did not apply the always-on-top state".into()); }
    }
    update_settings(app, state, serde_json::json!({ "pinned": pinned }))
}

#[tauri::command]
fn open_settings(app: AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("settings").ok_or("Settings window is unavailable")?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())
}

#[tauri::command]
fn hide_main(app: AppHandle) { if let Some(window) = app.get_webview_window("main") { let _ = window.hide(); } }

#[tauri::command]
fn close_settings(app: AppHandle) { if let Some(window) = app.get_webview_window("settings") { let _ = window.hide(); } }

#[tauri::command]
async fn import_asset(app: AppHandle, source: String, kind: String) -> Result<ImportedAsset, String> {
    let source_path = PathBuf::from(&source);
    let extension = source_path.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
    let allowed = if kind == "background" {
        ["jpg", "jpeg", "png", "webp", "bmp", "tif", "tiff", "avif", "gif", "apng", "mp4", "webm", "mov", "mkv", "avi", "m4v"].contains(&extension.as_str())
    } else { ["wav", "mp3", "ogg"].contains(&extension.as_str()) };
    if !allowed { return Err("Unsupported asset format".into()); }
    let metadata = fs::metadata(&source_path).map_err(|e| e.to_string())?;
    let limit = if kind == "background" { 500 * 1024 * 1024 } else { 15 * 1024 * 1024 };
    if metadata.len() > limit { return Err("Asset file is too large".into()); }
    let id = Uuid::new_v4().to_string();
    let assets_dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("assets");
    fs::create_dir_all(&assets_dir).map_err(|e| e.to_string())?;
    if kind == "sound" {
        let destination = assets_dir.join(format!("{}.{}", id, extension));
        fs::copy(&source_path, &destination).map_err(|e| e.to_string())?;
        let mime = match extension.as_str() { "wav" => "audio/wav", "mp3" => "audio/mpeg", _ => "audio/ogg" };
        return Ok(ImportedAsset { id, name: source_path.file_name().and_then(|value| value.to_str()).unwrap_or("asset").into(), kind, path: destination.to_string_lossy().into_owned(), mime: mime.into(), size: metadata.len(), media_type: "audio".into(), width: None, height: None, duration_ms: None });
    }

    let still_extensions = ["jpg", "jpeg", "png", "webp", "bmp", "tif", "tiff", "avif"];
    let is_still = still_extensions.contains(&extension.as_str());
    let output_extension = if is_still { "webp" } else { "webm" };
    let destination = assets_dir.join(format!("{}.{}", id, output_extension));
    let temporary = assets_dir.join(format!("{}.tmp.{}", id, output_extension));
    let _ = app.emit("media-import-progress", 5_u8);
    let mut args = vec!["-y".to_string(), "-hide_banner".into(), "-loglevel".into(), "error".into(), "-i".into(), source.clone()];
    if is_still {
        args.extend(["-vf".into(), "scale=1280:1280:force_original_aspect_ratio=decrease".into(), "-frames:v".into(), "1".into(), "-c:v".into(), "libwebp".into(), "-quality".into(), "82".into(), "-compression_level".into(), "6".into()]);
    } else {
        args.extend(["-vf".into(), "scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30".into(), "-an".into(), "-c:v".into(), "libvpx-vp9".into(), "-crf".into(), "34".into(), "-b:v".into(), "0".into(), "-deadline".into(), "good".into(), "-cpu-used".into(), "4".into(), "-row-mt".into(), "1".into()]);
    }
    args.push(temporary.to_string_lossy().into_owned());
    let output = app.shell().sidecar("ffmpeg").map_err(|e| e.to_string())?.args(args).output().await.map_err(|e| e.to_string())?;
    if !output.status.success() {
        let _ = fs::remove_file(&temporary);
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if message.is_empty() { "FFmpeg could not decode this media file".into() } else { message });
    }
    fs::rename(&temporary, &destination).map_err(|e| e.to_string())?;
    let output_size = fs::metadata(&destination).map_err(|e| e.to_string())?.len();
    let _ = app.emit("media-import-progress", 100_u8);
    Ok(ImportedAsset {
        id,
        name: source_path.file_name().and_then(|value| value.to_str()).unwrap_or("asset").into(),
        kind,
        path: destination.to_string_lossy().into_owned(),
        mime: if is_still { "image/webp" } else { "video/webm" }.into(),
        size: output_size,
        media_type: if is_still { "image" } else { "video" }.into(),
        width: None,
        height: None,
        duration_ms: None,
    })
}

fn initialize_database(path: &PathBuf) -> Result<(Vec<Task>, Vec<FocusSession>), String> {
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,title TEXT NOT NULL,estimate INTEGER NOT NULL,completed INTEGER NOT NULL,done INTEGER NOT NULL,position INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,task_id TEXT,started_at INTEGER NOT NULL,completed_at INTEGER NOT NULL,duration_seconds INTEGER NOT NULL,completed INTEGER NOT NULL);").map_err(|e| e.to_string())?;
    let tasks = {
        let mut stmt = conn.prepare("SELECT id,title,estimate,completed,done,position FROM tasks ORDER BY position").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| Ok(Task { id: row.get(0)?, title: row.get(1)?, estimate: row.get(2)?, completed: row.get(3)?, done: row.get(4)?, position: row.get(5)? }))
            .map_err(|e| e.to_string())?;
        rows.filter_map(Result::ok).collect()
    };
    let sessions = {
        let mut stmt = conn.prepare("SELECT id,task_id,started_at,completed_at,duration_seconds,completed FROM sessions ORDER BY completed_at DESC LIMIT 10000").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| Ok(FocusSession { id: row.get(0)?, task_id: row.get(1)?, started_at: row.get(2)?, completed_at: row.get(3)?, duration_seconds: row.get(4)?, completed: row.get(5)? }))
            .map_err(|e| e.to_string())?;
        rows.filter_map(Result::ok).collect()
    };
    Ok((tasks, sessions))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            #[cfg(target_os = "windows")]
            set_windows_app_user_model_id();
            fs::create_dir_all(&data_dir)?;
            let state_path = data_dir.join("state.json");
            let db_path = data_dir.join("cozy.db");
            let (tasks, sessions) = initialize_database(&db_path).map_err(std::io::Error::other)?;
            let persisted: Option<PersistedState> = fs::read(&state_path).ok().and_then(|bytes| serde_json::from_slice(&bytes).ok());
            let is_fresh_install = persisted.is_none();
            let mut settings = persisted.as_ref().map(|p| p.settings.clone()).unwrap_or_default();
            if is_fresh_install {
                let detected_locale = sys_locale::get_locale();
                settings.locale = locale_from_tag(detected_locale.as_deref());
            }
            if settings.focus_start_sound.starts_with("break-complete-") {
                settings.focus_start_sound = settings.focus_start_sound.replace("break-complete-", "focus-start-");
            }
            if settings.text_color.eq_ignore_ascii_case("#f8f7ef") { settings.text_color = "#F6EAD2".into(); }
            if settings.accent_color.eq_ignore_ascii_case("#f4c56b") { settings.accent_color = "#EAD0A0".into(); }
            if settings.focus_complete_sound == "focus-complete-1" && settings.focus_complete_custom_path.is_none() { settings.focus_complete_sound = "focus-complete-2".into(); }
            if settings.focus_start_sound == "focus-start-1" && settings.focus_start_custom_path.is_none() { settings.focus_start_sound = "focus-start-2".into(); }
            if settings.focus_custom_background_id.is_none() {
                if let Some(path) = &settings.focus_custom_background { settings.focus_custom_background_id = Some(format!("legacy:{path}")); }
            }
            if settings.break_custom_background_id.is_none() {
                if let Some(path) = &settings.break_custom_background { settings.break_custom_background_id = Some(format!("legacy:{path}")); }
            }
            ensure_liminute_background_defaults(&mut settings);
            let timer = persisted.map(|p| p.timer).unwrap_or_else(|| initial_timer(&settings));
            let pinned = settings.pinned;
            let start_minimized = settings.start_minimized;
            let initial_mode = settings.window_mode.clone();
            let mut runtime = RuntimeData { settings, timer, tasks, sessions };
            refresh_inactive_timer_duration(&mut runtime);
            if runtime.timer.status == "running" && runtime.timer.deadline.is_some_and(|deadline| deadline <= now_ms()) {
                if let Some(session) = next_after_completion(&mut runtime, now_ms(), false) { insert_session(&db_path, &session); }
            }
            app.manage(AppState { inner: Mutex::new(runtime), state_path, db_path });
            if let Some(state) = app.try_state::<AppState>() { emit_state(app.handle(), &state, true); }
            if let Some(window) = app.get_webview_window("main") {
                let _ = apply_window_preset(&window, &initial_mode);
                let _ = window.set_always_on_top(pinned);
                if start_minimized { let _ = window.hide(); }
                let window_clone = window.clone();
                window.on_window_event(move |event| if let WindowEvent::CloseRequested { api, .. } = event { api.prevent_close(); let _ = window_clone.hide(); });
            }
            if let Some(settings_window) = app.get_webview_window("settings") {
                let settings_clone = settings_window.clone();
                settings_window.on_window_event(move |event| if let WindowEvent::CloseRequested { api, .. } = event { api.prevent_close(); let _ = settings_clone.hide(); });
            }
            let show = MenuItem::with_id(app, "show", "Show / Hide", true, None::<&str>)?;
            let start = MenuItem::with_id(app, "start", "Start / Pause", true, None::<&str>)?;
            let skip = MenuItem::with_id(app, "skip", "Skip", true, None::<&str>)?;
            let pin = MenuItem::with_id(app, "pin", "Pin / Unpin", true, None::<&str>)?;
            let settings_item = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &start, &skip, &pin, &settings_item, &quit])?;
            TrayIconBuilder::new().icon(app.default_window_icon().unwrap().clone()).menu(&menu).show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => toggle_main(app),
                    "start" => toggle_timer(app),
                    "skip" => { if let Some(state) = app.try_state::<AppState>() { let _ = timer_command(app.clone(), state, "skip".into()); } },
                    "pin" => { if let Some(state) = app.try_state::<AppState>() { let pinned = state.inner.lock().map(|d| !d.settings.pinned).unwrap_or(false); let _ = set_pin(app.clone(), state, pinned); } },
                    "settings" => { let _ = open_settings(app.clone()); },
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event { toggle_main(tray.app_handle()); })
                .build(app)?;
            start_timer_loop(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_app_snapshot, timer_command, update_settings, add_task, update_task, delete_task, activate_task, set_window_mode, set_pin, open_settings, hide_main, close_settings, import_asset])
        .run(tauri::generate_context!())
        .expect("error while running Liminute");
}

fn toggle_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) { let _ = window.hide(); } else { let _ = window.show(); let _ = window.set_focus(); }
    }
}

fn toggle_timer(app: &AppHandle) {
    if let Some(state) = app.try_state::<AppState>() {
        let action = state.inner.lock().map(|d| if d.timer.status == "running" { "pause" } else { "start" }).unwrap_or("start");
        let _ = timer_command(app.clone(), state, action.into());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn runtime(completed_in_cycle: i64) -> RuntimeData {
        let settings = Settings::default();
        let mut timer = initial_timer(&settings);
        timer.completed_in_cycle = completed_in_cycle;
        timer.active_task_id = Some("task-1".into());
        RuntimeData {
            settings,
            timer,
            tasks: vec![Task { id: "task-1".into(), title: "Test".into(), estimate: 4, completed: 0, done: false, position: 0 }],
            sessions: vec![],
        }
    }

    #[test]
    fn fourth_focus_schedules_long_break_and_records_once() {
        let mut data = runtime(3);
        let session = next_after_completion(&mut data, 2_000_000, false);
        assert!(session.is_some());
        assert_eq!(data.timer.phase, "longBreak");
        assert_eq!(data.timer.status, "awaiting");
        assert_eq!(data.tasks[0].completed, 1);
        assert_eq!(data.sessions.len(), 1);
    }

    #[test]
    fn short_break_returns_to_focus_without_recording_session() {
        let mut data = runtime(2);
        data.timer.phase = "shortBreak".into();
        let session = next_after_completion(&mut data, 2_000_000, false);
        assert!(session.is_none());
        assert_eq!(data.timer.phase, "focus");
        assert_eq!(data.timer.completed_in_cycle, 2);
        assert!(data.sessions.is_empty());
    }

    #[test]
    fn window_presets_have_fixed_expected_dimensions() {
        assert_eq!(window_dimensions("mini"), (260.0, 126.0));
        assert_eq!(window_dimensions("compact"), (340.0, 210.0));
        assert_eq!(window_dimensions("expanded"), (420.0, 580.0));
    }

    #[test]
    fn old_settings_receive_new_sound_defaults() {
        let mut value = serde_json::to_value(Settings::default()).unwrap();
        let object = value.as_object_mut().unwrap();
        object.remove("focusCompleteSound");
        object.remove("focusStartSound");
        object.remove("focusCompleteCustomPath");
        object.remove("focusStartCustomPath");
        let migrated: Settings = serde_json::from_value(value).unwrap();
        assert_eq!(migrated.focus_complete_sound, "focus-complete-2");
        assert_eq!(migrated.focus_start_sound, "focus-start-2");
    }

    #[test]
    fn saved_duration_is_applied_to_idle_timer() {
        let mut data = runtime(0);
        data.settings.focus_minutes = 42;
        data.timer.remaining_ms = 25 * 60_000;
        refresh_inactive_timer_duration(&mut data);
        assert_eq!(data.timer.remaining_ms, 42 * 60_000);
        assert_eq!(data.timer.phase_duration_ms, 42 * 60_000);
    }

    #[test]
    fn paused_timer_survives_every_settings_change() {
        let mut data = runtime(0);
        data.timer.status = "paused".into();
        data.timer.remaining_ms = 612_345;
        data.timer.phase_duration_ms = 1_500_000;
        let old_duration = duration_for(&data.timer.phase, &data.settings);
        data.settings.focus_minutes = 42;
        data.settings.pinned = true;
        data.settings.window_mode = "expanded".into();
        refresh_timer_after_settings_change(&mut data, old_duration);
        assert_eq!(data.timer.status, "paused");
        assert_eq!(data.timer.remaining_ms, 612_345);
        assert_eq!(data.timer.phase_duration_ms, 1_500_000);
        assert_eq!(data.timer.deadline, None);
    }

    #[test]
    fn system_locale_uses_correct_language() {
        assert_eq!(locale_from_tag(Some("ru-RU")), "ru");
        assert_eq!(locale_from_tag(Some("en-US")), "en");
        assert_eq!(locale_from_tag(Some("de-DE")), "de");
        assert_eq!(locale_from_tag(Some("zh-CN")), "zh");
        assert_eq!(locale_from_tag(Some("fr-FR")), "fr");
        assert_eq!(locale_from_tag(Some("ja-JP")), "ja");
        assert_eq!(locale_from_tag(None), "en");
    }

    #[test]
    fn missing_classic_backgrounds_migrate_to_liminute_defaults() {
        let mut settings = Settings::default();
        settings.focus_custom_background = None;
        settings.focus_custom_background_id = None;
        settings.break_custom_background = None;
        settings.break_custom_background_id = None;
        ensure_liminute_background_defaults(&mut settings);
        assert_eq!(settings.focus_custom_background_id.as_deref(), Some("liminute-motion-6"));
        assert_eq!(settings.break_custom_background_id.as_deref(), Some("liminute-motion-1"));
    }

    #[test]
    fn imported_backgrounds_survive_default_migration() {
        let mut settings = Settings::default();
        settings.focus_custom_background = Some("C:\\media\\focus.webm".into());
        settings.focus_custom_background_id = Some("imported-focus".into());
        ensure_liminute_background_defaults(&mut settings);
        assert_eq!(settings.focus_custom_background_id.as_deref(), Some("imported-focus"));
        assert_eq!(settings.focus_custom_background.as_deref(), Some("C:\\media\\focus.webm"));
    }
}
