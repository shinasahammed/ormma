# Contributing to Ormma

Thanks for helping out! Ormma is a calm, local-first reminder companion for the
Linux desktop (Tauri 2 + React + TypeScript + Rust + SQLite).

## Principles

- **Local-first.** No accounts, no cloud, no analytics. Changes must not send
  reminder data off the device.
- **Calm.** Fewer prompts, gentle motion, respect reduced-motion settings.
- **Stable data.** The bundle identifier `app.ormma.desktop` and the database
  location must not change without a migration plan. Schema changes go in a
  new numbered file in `src-tauri/src/db/migrations/`; never edit an applied one.

## Setup

System packages, Node/Rust versions and dev commands are in the
[README](README.md#prerequisites-debianubuntu).

```bash
npm install
npx tauri dev
```

## Before opening a pull request

These are the same checks CI runs:

```bash
npm run build          # strict tsc + Vite
npm run test           # Vitest
cd src-tauri
cargo fmt --check
cargo test
```

Also try the change in the real app (`npx tauri dev`) when it touches the
scheduler, popup, tray, notifications or autostart. Those are covered by the
manual list in [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md).

## Guidelines

- Keep pull requests focused: one fix or feature each.
- Add or update tests for logic changes (`*.test.ts`, Rust unit tests).
- User-facing text lives in `src/lib/i18n/locales/`. Don't hard-code strings
  in components.
- Match the surrounding code's style, naming and comment density.
- Commit messages follow Conventional Commits, e.g. `feat(reminders): ...`,
  `fix(popup): ...`, `docs: ...`.

## Reporting bugs

Please use the bug report template. For anything desktop-related, include your
distro, desktop environment and whether you are on Wayland or X11. Many popup
and tray issues depend on it.

## License

By contributing you agree that your contributions are licensed under the
[MIT License](LICENSE).
