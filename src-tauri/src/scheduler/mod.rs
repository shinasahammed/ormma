//! Background reminder engine (Phase 3).
//!
//! - [`calculator`] decides purely: `(Reminder, now) -> Decision`.
//! - [`engine::tick_once`] persists verdicts and notifies.
//! - [`engine::runtime`] owns the single background loop (Tauri runtime).
//!
//! Nothing here touches React: the UI only observes state via commands.

pub mod calculator;
pub mod engine;
pub mod types;
