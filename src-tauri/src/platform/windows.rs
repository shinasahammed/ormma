//! Native window lifecycle (Phase 4).
//!
//! - Main window: close hides (app, tray and scheduler stay alive); explicit
//!   quit terminates everything.
//! - Reminder popup: hidden borderless always-on-top foundation for the Phase 6
//!   UI. Shown on demand, never modal, failures never affect scheduling.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_positioner::{Position, WindowExt};

use crate::error::{log_error, log_info, AppError, AppResult};

pub const MAIN_LABEL: &str = "main";
pub const POPUP_LABEL: &str = "reminder-popup";

/// Logical width of the popup window (also the centering fallback below).
const POPUP_WIDTH: f64 = 460.0;
/// Tall enough for the card plus its entrance/exit motion.
const POPUP_HEIGHT: f64 = 400.0;

fn hide_on_close(window: &WebviewWindow) {
    let label = window.label().to_string();
    let win = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            if let Err(e) = win.hide() {
                log_error(&format!("failed to hide window '{label}' on close: {e}"));
            }
        }
    });
}

/// Wires close-to-hide for the main window.
pub fn setup_window_events(app: &AppHandle) {
    if let Some(main) = app.get_webview_window(MAIN_LABEL) {
        hide_on_close(&main);
    } else {
        log_error("main window not found while wiring close behavior");
    }
}

/// Returns the popup window, creating its hidden foundation on first use.
/// The popup loads the dedicated `popup.html` entry (companion card only —
/// never the main dashboard). Creation failure is non-fatal: the scheduler
/// falls back to notifications.
pub fn ensure_popup_window(app: &AppHandle) -> Option<WebviewWindow> {
    if let Some(existing) = app.get_webview_window(POPUP_LABEL) {
        return Some(existing);
    }
    // Wayland compositors ignore client window positioning by protocol
    // design, so top-center there is best-effort (the compositor decides).
    // Logged once here instead of per-fire.
    // (`main` switches GTK to XWayland when available, which avoids this.)
    if std::env::var("XDG_SESSION_TYPE").as_deref() == Ok("wayland")
        && std::env::var("GDK_BACKEND").as_deref() != Ok("x11")
    {
        log_info(
            "wayland session: popup placement is compositor-controlled (best-effort top-center)",
        );
    }
    match WebviewWindowBuilder::new(app, POPUP_LABEL, WebviewUrl::App("popup.html".into()))
        .title("Reminder")
        .inner_size(POPUP_WIDTH, POPUP_HEIGHT)
        .resizable(false)
        .decorations(false)
        // Floating-bubble look: no window background, only the nook + card
        // paint. Needs a compositing WM (standard on GNOME/KDE); without one
        // the window falls back to an opaque background.
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .build()
    {
        Ok(window) => {
            hide_on_close(&window);
            Some(window)
        }
        Err(e) => {
            log_error(&format!("reminder popup creation failed: {e}"));
            None
        }
    }
}

fn parse_position(name: &str) -> AppResult<Position> {
    match name {
        "top-right" => Ok(Position::TopRight),
        "top-center" => Ok(Position::TopCenter),
        "bottom-right" => Ok(Position::BottomRight),
        "bottom-center" => Ok(Position::BottomCenter),
        _ => Err(AppError::validation(format!(
            "Unknown position '{name}': expected top-right, top-center, bottom-right or bottom-center"
        ))),
    }
}

/// Positions the popup. Best-effort on Wayland: compositors restrict absolute
/// placement, so the window is still shown even when exact placement fails.
pub fn position_popup(window: &WebviewWindow, position: Position) {
    if let Err(e) = window.move_window(position) {
        log_error(&format!("popup positioning failed (continuing): {e}"));
    }
}

/// Top margin (logical px) of the popup window. GNOME keeps the window below
/// the top bar (~28px), and the card has only ~6px of inner top padding, so
/// the card sits directly under the clock/date without touching it.
const POPUP_TOP_MARGIN: f64 = 16.0;

/// Logical px the window is shifted left of true centre, so the text bubble
/// (right of the avatar) sits under the top-bar clock instead of the
/// avatar+bubble group.
const POPUP_LEFT_SHIFT: f64 = -145.0;

/// Pure coordinate math (unit-tested): top-center of a monitor for the popup.
/// `x = monitor_x + (monitor_w - popup_w) / 2`, `y = monitor_y + margin`.
/// Never negative-overflows: a popup wider than the monitor starts at the
/// monitor origin.
fn top_center_coords(
    monitor_x: i32,
    monitor_y: i32,
    monitor_w: u32,
    popup_w: u32,
    margin_physical: i32,
) -> (i32, i32) {
    let x = monitor_x + (monitor_w.saturating_sub(popup_w) / 2) as i32;
    (x, monitor_y + margin_physical)
}

/// Best-effort nudge below the top edge. Resolution-independent: shifts the
/// already-computed position down by a logical margin (scaled to physical
/// px). Compositors that manage placement themselves (some Wayland setups)
/// may ignore it — placement still succeeds, just without the margin.
fn nudge_below_top(window: &WebviewWindow) {
    let margin = (POPUP_TOP_MARGIN * window.scale_factor().unwrap_or(1.0)).round() as i32;
    let Ok(pos) = window.outer_position() else {
        return;
    };
    if let Err(e) = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
        x: pos.x,
        y: pos.y + margin,
    })) {
        log_error(&format!("popup top-margin nudge failed (continuing): {e}"));
    }
}

/// Places the popup at the top-center of its current monitor, computed
/// explicitly from live monitor geometry (no hardcoded coordinates, correct
/// on any resolution and monitor offset). Falls back to the positioner when
/// geometry is unavailable. Best-effort on Wayland: compositors may ignore
/// client positioning and place the window themselves.
fn place_top_center(window: &WebviewWindow) {
    let scale = window.scale_factor().unwrap_or(1.0);
    let margin = (POPUP_TOP_MARGIN * scale).round() as i32;
    let explicit = (|| -> Option<()> {
        let monitor = window.current_monitor().ok()??;
        // A window that was only just shown can still report a zero size
        // (not yet mapped), which would left-align it at the monitor centre.
        let reported = window.outer_size().ok()?.width;
        let width = if reported > 0 {
            reported
        } else {
            (POPUP_WIDTH * scale).round() as u32
        };
        let (x, y) = top_center_coords(
            monitor.position().x,
            monitor.position().y,
            monitor.size().width,
            width,
            margin,
        );
        let x = x - (POPUP_LEFT_SHIFT * scale).round() as i32;
        window
            .set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }))
            .ok()?;
        Some(())
    })();
    if explicit.is_none() {
        position_popup(&window, Position::TopCenter);
        nudge_below_top(window);
    }
}

/// Shows the popup for a fired reminder. Never fails the scheduler: window
/// errors are logged and swallowed here.
pub fn show_popup_for_reminder(app: &AppHandle, reminder_id: i64) {
    let Some(window) = ensure_popup_window(app) else {
        return;
    };
    // Show first: a hidden window has no monitor association yet, so
    // positioning must run after the window exists on screen. Placement
    // stays best-effort (notably on Wayland) — see `place_top_center`.
    if let Err(e) = window.show().and_then(|()| window.set_focus()) {
        log_error(&format!(
            "showing reminder popup for reminder id {reminder_id} failed: {e}"
        ));
        return;
    }
    place_top_center(&window);
}

fn window_error(action: &str, detail: impl std::fmt::Display) -> AppError {
    AppError::internal_error(action, detail.to_string())
}

pub fn show_main(app: &AppHandle) -> AppResult<()> {
    let Some(window) = app.get_webview_window(MAIN_LABEL) else {
        return Err(window_error("showing main window", "main window missing"));
    };
    window
        .show()
        .and_then(|()| window.set_focus())
        .map_err(|e| window_error("showing main window", e))
}

pub fn hide_main(app: &AppHandle) -> AppResult<()> {
    let Some(window) = app.get_webview_window(MAIN_LABEL) else {
        return Err(window_error("hiding main window", "main window missing"));
    };
    window
        .hide()
        .map_err(|e| window_error("hiding main window", e))
}

pub fn show_popup(app: &AppHandle, position: Option<String>) -> AppResult<()> {
    let placement = parse_position(position.as_deref().unwrap_or("top-center"))?;
    let top_anchored = matches!(placement, Position::TopCenter | Position::TopRight);
    let Some(window) = ensure_popup_window(app) else {
        return Err(window_error("showing reminder popup", "popup unavailable"));
    };
    if matches!(placement, Position::TopCenter) {
        place_top_center(&window);
    } else {
        position_popup(&window, placement);
        if top_anchored {
            nudge_below_top(&window);
        }
    }
    window
        .show()
        .and_then(|()| window.set_focus())
        .map_err(|e| window_error("showing reminder popup", e))
}

pub fn hide_popup(app: &AppHandle) -> AppResult<()> {
    let Some(window) = app.get_webview_window(POPUP_LABEL) else {
        return Ok(());
    };
    window
        .hide()
        .map_err(|e| window_error("hiding reminder popup", e))
}

pub fn set_popup_position(app: &AppHandle, position: &str) -> AppResult<()> {
    let placement = parse_position(position)?;
    if let Some(window) = ensure_popup_window(app) {
        position_popup(&window, placement);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn top_center_math() {
        // 1920px monitor, 460px popup, 40px margin: x = (1920-460)/2.
        assert_eq!(top_center_coords(0, 0, 1920, 460, 40), (730, 40));
        // Second monitor offset is preserved.
        assert_eq!(top_center_coords(1920, 0, 1920, 460, 40), (2650, 40));
        // Odd widths truncate (no sub-pixel positions).
        assert_eq!(top_center_coords(0, 0, 1365, 460, 40), (452, 40));
        // Popup wider than the monitor clamps at the monitor origin.
        assert_eq!(top_center_coords(0, 0, 300, 460, 40), (0, 40));
    }
}
