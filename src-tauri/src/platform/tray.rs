//! System tray (Phase 4).
//!
//! Single tray instance built once in `setup`. Left-click reopens the main
//! window; the menu exposes Open / Pause / Resume / Settings / Quit. Closing
//! the main window never touches the tray or the scheduler — only Quit exits.
//! All handlers are total: tray errors are logged and never crash the engine.

use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle,
};

use crate::error::{log_error, AppError, AppResult};

fn tray_err(context: &str, error: tauri::Error) -> AppError {
    AppError::internal_error(context, error.to_string())
}

/// Builds the tray icon and menu. Called exactly once from `setup`, so a
/// duplicate instance is impossible by construction.
pub fn build(app: &AppHandle) -> AppResult<()> {
    let icon = Image::from_bytes(include_bytes!("../../icons/tray-icon.png"))
        .map_err(|e| tray_err("loading tray icon", e))?;

    let open = MenuItem::with_id(app, "open", "Open Papa.app", true, None::<&str>)
        .map_err(|e| tray_err("building tray menu", e))?;
    let pause = MenuItem::with_id(app, "pause", "Pause reminders", true, None::<&str>)
        .map_err(|e| tray_err("building tray menu", e))?;
    let resume = MenuItem::with_id(app, "resume", "Resume reminders", true, None::<&str>)
        .map_err(|e| tray_err("building tray menu", e))?;
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)
        .map_err(|e| tray_err("building tray menu", e))?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)
        .map_err(|e| tray_err("building tray menu", e))?;
    let sep_top =
        PredefinedMenuItem::separator(app).map_err(|e| tray_err("building tray menu", e))?;
    let sep_bottom =
        PredefinedMenuItem::separator(app).map_err(|e| tray_err("building tray menu", e))?;

    let menu = Menu::with_items(
        app,
        &[
            &open,
            &sep_top,
            &pause,
            &resume,
            &sep_bottom,
            &settings,
            &quit,
        ],
    )
    .map_err(|e| tray_err("building tray menu", e))?;

    TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .tooltip("Papa.app")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| on_menu(app, event.id.as_ref()))
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if let Err(e) = crate::platform::windows::show_main(tray.app_handle()) {
                    log_error(&format!("tray open failed: {e}"));
                }
            }
        })
        .build(app)
        .map(|_| ())
        .map_err(|e| tray_err("creating tray icon", e))
}

fn on_menu(app: &AppHandle, id: &str) {
    let result = match id {
        "open" | "settings" => crate::platform::windows::show_main(app),
        "pause" => crate::commands::platform::pause_impl(app).map(|_| ()),
        "resume" => crate::commands::platform::resume_impl(app).map(|_| ()),
        "quit" => {
            app.exit(0);
            Ok(())
        }
        _ => return,
    };
    if let Err(e) = result {
        log_error(&format!("tray action '{id}' failed: {e}"));
    }
}
