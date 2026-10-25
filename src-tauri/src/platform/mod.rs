//! Linux platform abstraction (Phase 4).
//!
//! Layering:
//!
//! ```text
//! React -> platform.ts -> Tauri command -> platform/* -> Linux
//! ```
//!
//! - [`env`]: desktop/display-server detection (Tauri-free, unit-tested).
//! - [`windows`]: main-window lifecycle and the reminder-popup foundation.
//! - [`tray`]: system tray icon and menu (built once, never duplicated).
//! - [`autostart`]: login autostart through the Tauri plugin.
//!
//! The reminder domain (scheduler, db, models) never imports this module —
//! integration flows one way: platform calls into application services.

pub mod autostart;
pub mod env;
pub mod tray;
pub mod windows;

pub use env::{detect, PlatformInfo};
