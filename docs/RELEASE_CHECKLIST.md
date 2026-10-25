# Papa.app — Release Test Checklist

How to validate a Papa.app build before release. Items marked **[AUTO]**
run in this environment; items marked **[RUNTIME]** need a real Linux GUI
with WebKitGTK/Soup/Rsvg dev packages and a display server.

## Automated verification (run every release)

```bash
npm run build        # strict tsc + Vite (main + popup entries)
npm run test         # Vitest unit suite (pure frontend logic)
cargo fmt --check    # Rust formatting (src-tauri/)
```

Rust unit tests (`cargo test`) need the system webview toolchain. Without
it, run the equivalent harness (compiles the exact `error`/`models`/`db`/
`scheduler`/`platform-env` sources minus Tauri-runtime items):

```bash
# one-time harness setup mirrors /tmp/papa-dbverify (see Phase 9 notes):
cargo test           # inside the harness checkout
```

Expected: Vitest all-pass, Rust harness all-pass, fmt clean, build clean.

## Test strategy layers

1. **Unit** — Vitest (validation, formatting, i18n, theme, tones,
   presets, popup queue/payload/motion) + Rust (`models`, `db`,
   `calculator`, `engine`, `platform::env`, error wire shape).
2. **Integration** — engine ticks against temp SQLite databases;
   command contracts reviewed against Tauri 2.11 sources.
3. **Runtime** — below; requires GUI environment.
4. **Release verification** — this checklist.

## [RUNTIME] Fresh install

- [ ] Application launches, no stderr errors
- [ ] `papa.db` created in app-data dir, migrations applied
- [ ] Defaults loaded (theme system, English, tone soft fallback)
- [ ] Tray icon appears (needs AppIndicator on stock GNOME)
- [ ] Scheduler starts (first tick = recovery, no spurious fires)

## [RUNTIME] First reminder

- [ ] Create reminder → appears in list
- [ ] Wait for firing → desktop notification + popup appear
- [ ] Popup shows correct title/message/schedule
- [ ] Done dismisses; no duplicate firing on later ticks

## [RUNTIME] Recurring + snooze

- [ ] Daily fires once per day; weekly fires on configured days only
- [ ] Snooze (5/10/15/30/60) returns; survives app restart
- [ ] Pause → wait past fire time → nothing fires, state intact
- [ ] Resume → grace/recovery policy applies

## [RUNTIME] Settings

- [ ] Theme light/dark/system (main + popup follow; OS change follows)
- [ ] Tone default + per-reminder override + preview plays sound
- [ ] Notifications off → no desktop alert, popup still appears
- [ ] Autostart on/off reflects real login state, no duplicates
- [ ] Launch-minimized starts hidden with tray alive
- [ ] Restart persists everything above

## [RUNTIME] Popup

- [ ] Long title/message scroll safely in the fixed window
- [ ] Two rapid reminders queue FIFO with "+N more"
- [ ] Snooze failure keeps popup visible with retry
- [ ] Esc closes menu-first, then popup; S toggles menu; Enter = Done
- [ ] Reduced-motion setting yields fade-only transitions
- [ ] Bottom-right placement; sane fallback on Wayland

## [RUNTIME] Tray + lifecycle

- [ ] Left-click opens main window; Close hides (app alive)
- [ ] Tray Pause/Resume match engine state
- [ ] Quit terminates process and scheduler thread
- [ ] Exactly one tray icon, one popup window, one scheduler loop

## [RUNTIME] Accessibility

- [ ] Full keyboard pass (nav, cards, toggles, forms, dialogs, popup)
- [ ] Focus visible everywhere; dialogs return focus to opener
- [ ] Screen-reader spot check (labels, switches, live regions)

## [RUNTIME] Linux matrix (claim only what was run)

- [ ] GNOME / Wayland (primary)
- [ ] GNOME / X11, KDE / Wayland, KDE / X11 (as available)
