#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// Wayland compositors ignore client-side window placement, so the reminder
/// popup could never sit at the top of the screen. Running GTK through
/// XWayland (when available) restores explicit positioning and always-on-top.
/// Must run before GTK initializes; an explicit `GDK_BACKEND` always wins.
#[cfg(target_os = "linux")]
fn prefer_x11_for_popup_placement() {
    let wayland = std::env::var("XDG_SESSION_TYPE").as_deref() == Ok("wayland");
    let has_xwayland = std::env::var_os("DISPLAY").is_some();
    if wayland && has_xwayland && std::env::var_os("GDK_BACKEND").is_none() {
        std::env::set_var("GDK_BACKEND", "x11");
    }
}

fn main() {
    #[cfg(target_os = "linux")]
    prefer_x11_for_popup_placement();
    papa_app::run();
}
