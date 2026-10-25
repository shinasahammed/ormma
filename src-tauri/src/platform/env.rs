//! Linux runtime environment detection (Phase 4).
//!
//! Tauri-free and deterministic: detection reads a key/value map so tests can
//! inject fixtures. Production passes the real process environment. Unknown
//! values are always a valid outcome — product behavior must never depend on
//! detecting a specific desktop.

use std::collections::HashMap;

use serde::Serialize;

/// Frontend-facing platform description (plain strings over the wire).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PlatformInfo {
    pub os: String,
    pub desktop: String,
    pub display_server: String,
}

fn desktop_from(value: &str) -> &'static str {
    let lower = value.to_lowercase();
    if lower.contains("gnome") {
        "gnome"
    } else if lower.contains("kde") || lower.contains("plasma") {
        "kde"
    } else {
        "unknown"
    }
}

fn display_server_from(env: &HashMap<String, String>) -> &'static str {
    let session_type = env
        .get("XDG_SESSION_TYPE")
        .map(|v| v.to_lowercase())
        .unwrap_or_default();
    if session_type.contains("wayland") {
        return "wayland";
    }
    if session_type.contains("x11") {
        return "x11";
    }
    // Fallbacks when the session type is absent (ssh, nested compositors).
    if env.contains_key("WAYLAND_DISPLAY") {
        return "wayland";
    }
    if env.contains_key("DISPLAY") {
        return "x11";
    }
    "unknown"
}

/// Detects from an explicit environment map (used by tests and callers that
/// already hold the environment).
pub fn detect_from(env: &HashMap<String, String>) -> PlatformInfo {
    PlatformInfo {
        os: std::env::consts::OS.to_string(),
        desktop: desktop_from(
            env.get("XDG_CURRENT_DESKTOP")
                .map(String::as_str)
                .unwrap_or(""),
        )
        .to_string(),
        display_server: display_server_from(env).to_string(),
    }
}

/// Detects from the real process environment.
pub fn detect() -> PlatformInfo {
    detect_from(&std::env::vars().collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn env(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| ((*k).to_string(), (*v).to_string()))
            .collect()
    }

    #[test]
    fn detects_ubuntu_gnome_wayland() {
        let info = detect_from(&env(&[
            ("XDG_CURRENT_DESKTOP", "ubuntu:GNOME"),
            ("XDG_SESSION_TYPE", "wayland"),
            ("WAYLAND_DISPLAY", "wayland-0"),
        ]));
        assert_eq!(info.desktop, "gnome");
        assert_eq!(info.display_server, "wayland");
        assert_eq!(info.os, "linux");
    }

    #[test]
    fn detects_kde_x11() {
        let info = detect_from(&env(&[
            ("XDG_CURRENT_DESKTOP", "KDE"),
            ("XDG_SESSION_TYPE", "x11"),
            ("DISPLAY", ":0"),
        ]));
        assert_eq!(info.desktop, "kde");
        assert_eq!(info.display_server, "x11");
    }

    #[test]
    fn unknown_when_undetectable() {
        let info = detect_from(&env(&[]));
        assert_eq!(info.desktop, "unknown");
        assert_eq!(info.display_server, "unknown");
    }

    #[test]
    fn display_fallbacks_without_session_type() {
        let wayland = detect_from(&env(&[("WAYLAND_DISPLAY", "wayland-1")]));
        assert_eq!(wayland.display_server, "wayland");
        let x11 = detect_from(&env(&[("DISPLAY", ":99")]));
        assert_eq!(x11.display_server, "x11");
    }
}
