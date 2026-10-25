mod commands;
mod db;
mod error;
mod models;
mod notifications;
mod platform;
mod scheduler;

use crate::db::with_state;
use crate::error::log_error;
use tauri::Manager;

/// Tauri 2 entry point (Phase 4: Linux system integration).
///
/// Startup: app-data dir -> open/migrate `papa.db` -> manage `DbState` ->
/// restore pause flag -> init plugins (notification, autostart, positioner)
/// -> wire window events -> build tray -> sync autostart preference ->
/// apply launch-minimized -> start scheduler (first tick = recovery).
/// Tray/window/autostart failures are logged and never block startup.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be registered first: a second launch (e.g. clicking the app icon
        // while it lives in the tray) must not start a second scheduler on the
        // same database. It just brings the running instance to the front.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Err(e) = platform::windows::show_main(app) {
                log_error(&format!("second launch could not show main window: {e}"));
            }
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_positioner::init())
        .setup(|app| {
            let state = commands::init_app_db(app.handle())
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;
            app.manage(state);

            // Restore persisted pause state before the scheduler starts.
            // (`manage` just ran, so the state is guaranteed present.)
            let paused = with_state(&app.state::<crate::db::DbState>(), |conn| {
                crate::db::get_paused(conn)
            });
            if let Ok(paused) = paused {
                scheduler::engine::set_paused(paused);
            }

            platform::windows::setup_window_events(app.handle());
            if platform::windows::ensure_popup_window(app.handle()).is_none() {
                log_error("continuing without pre-created reminder popup (lazy retry on fire)");
            }
            if let Err(e) = platform::tray::build(app.handle()) {
                log_error(&format!("continuing without system tray: {e}"));
            }

            // Reconcile autostart entry and launch visibility with preferences.
            let settings = with_state(&app.state::<crate::db::DbState>(), |conn| {
                crate::db::get_settings(conn)
            });
            if let Ok(settings) = settings {
                platform::autostart::apply_preferred(app.handle(), settings.autostart_enabled);
                if settings.launch_minimized {
                    if let Err(e) = platform::windows::hide_main(app.handle()) {
                        log_error(&format!("launch-minimized hide failed: {e}"));
                    }
                }
            }

            scheduler::engine::runtime::start(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_reminders,
            commands::get_reminder,
            commands::create_reminder,
            commands::update_reminder,
            commands::delete_reminder,
            commands::set_reminder_enabled,
            commands::snooze_reminder,
            commands::trigger_reminder_test,
            commands::get_settings,
            commands::update_settings,
            commands::platform::get_platform_info,
            commands::platform::get_app_status,
            commands::platform::pause_reminders,
            commands::platform::resume_reminders,
            commands::platform::show_main_window,
            commands::platform::hide_main_window,
            commands::platform::show_reminder_window,
            commands::platform::hide_reminder_window,
            commands::platform::set_reminder_position,
            commands::platform::set_autostart,
            commands::platform::quit_app,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Papa.app");
}
