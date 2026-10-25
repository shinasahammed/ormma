# Papa.app

A calm, local-first reminder companion for the Linux desktop.
Tauri 2 + React + TypeScript + SQLite (`rusqlite`, bundled) + Rust scheduler.
No accounts, no cloud, no analytics — reminders never leave the device.

## Current version: 0.1.0

Versioning is semantic (`MAJOR.MINOR.PATCH`) and kept consistent in
`package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.
The bundle identifier `app.papa.desktop` and the database location are
stable across releases — never rename them without a data-migration plan.

## Prerequisites (Debian/Ubuntu)

```bash
sudo apt update && sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  libsoup-3.0-dev \
  librsvg2-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  libxdo-dev \
  build-essential curl wget file
```

Node 22+, Rust stable via [rustup](https://rustup.rs).

## Develop / verify

```bash
npm install
npm run build        # strict tsc + Vite (dashboard + popup entries)
npm run test         # Vitest unit suite
npm run test:watch   # watch mode
cargo fmt --check    # from src-tauri/
cargo test           # from src-tauri/ (needs the system deps above)
npx tauri dev        # GUI development (needs a display server)
```

## Package (Linux: .deb + AppImage)

```bash
npx tauri build --bundles deb
npx tauri build --bundles appimage
```

Icons live in `src-tauri/icons/` (generated with `npx tauri icon` from the
original `icon.png`; the tray uses `tray-icon.png`). Bundle targets are
intentionally Linux-only (`deb`, `appimage`).

## Install / upgrade / uninstall

- Install the `.deb` (`sudo dpkg -i …`) or run the `.AppImage`.
- First launch creates `~/.local/share/app.papa.desktop/papa.db`
  (via Tauri's app-data directory — never hard-coded) and default settings.
- Upgrades keep the database: schema migrations are versioned and idempotent.
- Uninstall (`sudo dpkg -r …`) removes the app but **keeps user data** in
  `~/.local/share/app.papa.desktop/`; delete that directory for a full reset.
- Autostart state is managed in-app (Settings → Start on login) with user
  consent only.

## Manual release gates

See `docs/RELEASE_CHECKLIST.md` — automated checks plus the GUI-gated
matrix (tray, popup, notifications, autostart, lifecycle, Linux DEs).
