# Liminute

Liminute is a small Pomodoro timer for Windows made by FinSi. It stays out of the way while you work, keeps running in the system tray, and supports photo or video backgrounds without requiring a separate media converter.

## Features

- Focus, short-break, and long-break phases with optional automatic transitions.
- A native deadline-based timer that survives window changes, sleep, and application restarts.
- Mini (260×126), Compact (340×210), and Expanded (420×580) window modes.
- Always-on-top mode, Windows notifications, autostart, and close-to-tray behavior.
- A lightweight task list with completed focus sessions stored locally in SQLite.
- Built-in Liminute backgrounds plus imports for common image, GIF, APNG, and video formats.
- Per-image breathing controls for scale, speed, and drift.
- Separate sounds for focus completion and focus start.
- Russian and English interfaces.

## Media backgrounds

Liminute includes FFmpeg as a sidecar, so users do not need to install it themselves. Imported static images are converted to WebP. Animations and videos are converted to silent VP9 WebM at up to 30 FPS. The original file is never modified.

Normalized files are stored in the application's data directory. Backgrounds always preserve their aspect ratio and use cover scaling to fill every window mode.

## Installation

There is no public download link until the first GitHub release is published. A local Windows installer can be built with:

```powershell
npm install
npm run tauri build
```

The installer will be written to:

```text
src-tauri/target/release/bundle/nsis/Liminute_0.4.0_x64-setup.exe
```

Unsigned builds may trigger a Windows SmartScreen warning. Closing the main window hides it; use **Quit** from the tray menu to stop the application completely.

## Development

Requirements:

- Node.js 20 or newer
- A current stable Rust toolchain
- Windows 10 or Windows 11 with WebView2
- Git LFS for the bundled FFmpeg executable

Run the web preview:

```powershell
npm install
npm run dev
```

Run the native application:

```powershell
npm run tauri dev
```

## Verification

Before creating a release, run:

```powershell
npm run build
npm test
cd src-tauri
cargo test
cargo check
cd ..
npm run tauri build
```

The release build should also be checked manually in all three window modes and in both languages. Verify close-to-tray, single-instance behavior, Pin, background imports, and restoration of a paused timer.

## Project structure

- `src/` contains the React interface and browser preview backend.
- `src-tauri/` contains the native timer, persistence, tray integration, notifications, window management, and media conversion.
- `public/backgrounds/` contains the built-in background collection.

React does not advance the timer itself. Rust owns the native timer state, and the absolute deadline remains the source of truth while a phase is running.

## Privacy

Liminute is local-first. Tasks, focus history, settings, and imported backgrounds remain on the computer. The application does not upload user data.

## Third-party materials

Read [THIRD_PARTY_ASSETS.md](THIRD_PARTY_ASSETS.md) before distributing a build. FFmpeg licensing and source-distribution requirements are documented in [src-tauri/resources/FFMPEG-NOTICE.txt](src-tauri/resources/FFMPEG-NOTICE.txt).

Some bundled background files still need confirmed author and redistribution details before a public release can be published.
