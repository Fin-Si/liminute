# Project memory

## Architecture

- React отвечает только за UI. Нативный таймер, восстановление, трей, Pin, уведомления и SQLite принадлежат Rust/Tauri.
- Источник истины таймера — абсолютный `deadline` в миллисекундах. UI не должен уменьшать время самостоятельно.
- Окно по крестику скрывается. Реальное завершение допустимо только из пункта `Quit` в трее.
- Браузерный backend в `src/lib/bridge.ts` нужен для визуальной разработки и должен повторять нативные команды.

## Tauri/Windows lessons

- Для `convertFileSrc` одновременно нужны `security.assetProtocol`, scope в `tauri.conf.json` и Cargo feature `protocol-asset`.
- Пользовательские фоны копируются в app data; не воспроизводить исходные пути вне разрешённого asset scope.
- При пробуждении или сильно просроченном deadline завершать максимум одну фазу и не генерировать автоматические циклы задним числом.
- Режимы окна используют фиксированные размеры: Mini 260×126, Compact 340×210, Expanded 420×580. Свободный resize основного окна запрещён.
- Отдельный stacking context (`isolation: isolate`) обязателен для предпросмотра сцены, поскольку фон имеет отрицательный `z-index`.
- Release entrypoint обязан содержать `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`; иначе ярлык запускает Windows Terminal, а закрытие терминала убивает приложение.
- Settings нельзя создавать поздно через `WebviewWindowBuilder` без native smoke test: в этой конфигурации динамический WebView открылся как `about:blank`. Надёжный паттерн — объявить скрытое окно `settings` в `tauri.conf.json`, загрузить его при старте и затем только show/hide.
- Сохранённый `windowMode` нужно применять к нативному окну в `setup`; одного CSS-класса недостаточно, иначе Expanded окажется внутри размеров Compact.
- Для стабильной работы между мониторами окно остаётся непрозрачным и прямоугольным на уровне HWND; скругление рисуется только внутри WebView.

## Verification before release

- Выполнить `npm run build`, `npm test`, `cargo check` и `npm run tauri build`.
- Визуально проверить все три режима, RU/EN и вкладки настроек.
- Запустить release exe и убедиться, что процесс остаётся активен после скрытия окна.
- Проверять release-окна скриншотом с рабочего стола: browser preview не обнаруживает console subsystem, `about:blank` во втором WebView и рассинхронизацию сохранённого пресета с HWND.
- Обновлять `THIRD_PARTY_ASSETS.md` при любом добавлении внешнего ассета.

## Future reusable skill candidate

## Release 0.4.0 lessons

- Generic settings patches must never refresh `paused` or `running` timers. Recompute an inactive timer only when the duration of its current phase actually changed; Pin, window mode, sound and appearance updates must preserve all timer fields.
- Bundle background conversion as a native FFmpeg sidecar. Write normalized media to a temporary app-data path and rename only after success; never expose or mutate the selected source path.
- Use WebP for static backgrounds and silent VP9 WebM capped at 30 FPS for animated/video backgrounds. Preserve aspect ratio during encoding and use `object-fit: cover` at render time because Mini, Compact and Expanded have incompatible aspect ratios.
- Distinguish bundled web URLs from native filesystem paths before calling `convertFileSrc`.
- When a custom background is present, hide every procedural scene layer except the dimming overlay. A correctly loaded image/video can otherwise sit behind later DOM siblings and appear broken even though playback succeeds.
- Store breathing controls by stable background asset ID, not by focus/break slot, so the same image keeps one profile everywhere.
- FFmpeg binaries and bundled third-party backgrounds are release-compliance surfaces: record binary version/hash/license and block public distribution of assets with missing provenance.
- The reusable implementation checklist now lives in the `tauri-media-background-adapter` skill.

## Release 0.3.0 lessons

- Never select the Tauri or browser backend once at module evaluation time. WebView2 can run frontend effects before native state is ready. Resolve the backend lazily and retry the initial native snapshot; otherwise the UI can remain on defaults while Rust has the saved state.
- Async React subscriptions must dispose themselves if Strict Mode cleanup runs before subscription setup finishes. Assigning cleanup only after the promise resolves leaks the first listener.
- Do not combine transparent Windows webviews with `SetWindowRgn` for this widget. Physical-pixel window regions produced visible edge artifacts after moving between monitors. The stable v1 contract is an opaque, fixed-size HWND with visual rounding inside the webview.
- Single-instance behavior is part of release QA: a second executable must exit and focus/show the existing main window.
- The current fixed presets are Mini 260x126, Compact 340x210, and Expanded 420x580. The main window is intentionally not freely resizable.
- Cold-start QA must include at least three process restarts and compare DOM state with `get_app_snapshot`; a warm in-process test cannot detect startup bridge races.

Если появится второй Tauri-виджет с tray/close-to-tray/deadline recovery, вынести эти проверенные паттерны в отдельный skill. Пока знания специфичны одному проекту и сохранены здесь, чтобы не плодить преждевременные абстракции.
