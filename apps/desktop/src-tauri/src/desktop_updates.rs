use std::sync::atomic::{AtomicBool, Ordering};

use serde_json::json;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::{launch_runtime, stop_runtime, desktop_ops, RuntimeProcess};

// A downloaded update is verified by the official Tauri updater BEFORE the
// frontend is offered the Install action. The bytes and signed metadata stay
// together; we never trust a URL supplied by the renderer.
pub struct DesktopUpdateState {
    pending: tokio::sync::Mutex<Option<PendingUpdate>>,
    installing: AtomicBool,
}

struct PendingUpdate {
    update: Update,
    bytes: Vec<u8>,
}

impl Default for DesktopUpdateState {
    fn default() -> Self {
        Self {
            pending: tokio::sync::Mutex::new(None),
            installing: AtomicBool::new(false),
        }
    }
}

pub fn update_enabled() -> bool {
    cfg!(windows) && option_env!("NOTESPACE_UPDATER_ENABLED") == Some("1")
}

#[tauri::command]
pub fn desktop_updater_enabled() -> bool {
    update_enabled()
}

#[tauri::command]
pub async fn prepare_desktop_update(
    app: AppHandle,
    state: State<'_, DesktopUpdateState>,
) -> Result<Option<serde_json::Value>, String> {
    if !update_enabled() {
        return Ok(None);
    }
    if state.installing.load(Ordering::Acquire) {
        return Err("An update is already being installed".into());
    }
    let mut pending = state.pending.lock().await;
    if let Some(existing) = pending.as_ref() {
        return Ok(Some(json!({
            "version": existing.update.version,
            "notes": existing.update.body
        })));
    }

    let update = app
        .updater()
        .map_err(|error| format!("Initialize signed updater: {error}"))?
        .check()
        .await
        .map_err(|error| format!("Check for desktop updates: {error}"))?;
    let Some(update) = update else {
        return Ok(None);
    };
    // The official plugin verifies the downloaded artifact's signature before
    // this method returns the bytes. On verification failure, no installation
    // capability is placed in state.
    let bytes = update
        .download(|_, _| {}, || {})
        .await
        .map_err(|error| format!("Download or verify signed update: {error}"))?;
    let info = json!({"version": update.version, "notes": update.body});
    *pending = Some(PendingUpdate { update, bytes });
    Ok(Some(info))
}

#[tauri::command]
pub async fn install_prepared_desktop_update(
    app: AppHandle,
    state: State<'_, DesktopUpdateState>,
) -> Result<(), String> {
    if !update_enabled() {
        return Err("Desktop updater is not configured in this build".into());
    }
    if app.state::<RuntimeProcess>().backup_in_flight.load(Ordering::Acquire) {
        return Err("A SQLite backup is running; finish it before installing updates".into());
    }
    if state.installing.swap(true, Ordering::AcqRel) {
        return Err("Update installation is already in progress".into());
    }

    // The frontend has completed the same autosave flush used for window
    // close, and blocked editing before invoking this command.
    let pending = state.pending.lock().await.take();
    let Some(pending) = pending else {
        state.installing.store(false, Ordering::Release);
        return Err("No verified update has been downloaded".into());
    };

    // On Windows Tauri may terminate the process when launching MSI. Stop the
    // Go sidecar gracefully first so SQLite can complete pending transactions.
    desktop_ops::record(&app, "update_install_requested");
    stop_runtime(&app);
    if let Err(error) = pending.update.install(&pending.bytes) {
        desktop_ops::record(&app, "update_install_failed");
        state.installing.store(false, Ordering::Release);
        // Recovery goes through the same generation-aware supervisor as
        // ordinary startup. Never spawn a child outside lifecycle guards.
        if let Err(start_error) = launch_runtime(&app) {
            eprintln!("notespace updater: supervisor could not schedule restart: {start_error}");
        }
        return Err(format!("Install signed update: {error}"));
    }
    // Windows updater handles application termination/relaunch itself.
    Ok(())
}

#[tauri::command]
pub async fn cancel_prepared_desktop_update(state: State<'_, DesktopUpdateState>) -> Result<(), String> {
    if !state.installing.load(Ordering::Acquire) {
        *state.pending.lock().await = None;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn updater_is_disabled_without_production_configuration() {
        if option_env!("NOTESPACE_UPDATER_ENABLED") != Some("1") {
            assert!(!update_enabled());
        }
    }

    #[test]
    fn updater_never_runs_on_unshipped_platforms() {
        if !cfg!(windows) {
            assert!(!update_enabled());
        }
    }
}
