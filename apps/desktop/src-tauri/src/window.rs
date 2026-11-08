use crate::runtime::{stop_runtime, RuntimeProcess};
use std::{sync::atomic::Ordering, time::Duration};
use tauri::{AppHandle, Manager};
const CLOSE_HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(10);

pub(crate) fn request_close(app: &AppHandle, api: tauri::CloseRequestApi) {
    // Do not terminate a backup worker mid-write. Completed backups are only
    // published after the worker has validated and closed its SQLite snapshot.
    if app
        .state::<RuntimeProcess>()
        .backup_in_flight
        .load(Ordering::Acquire)
    {
        api.prevent_close();
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.eval("window.dispatchEvent(new CustomEvent('notespace:close-status',{detail:{state:'error',message:'A backup is in progress. Finish it before closing.'}}))");
        }
        return;
    }
    // The native recovery view has no React close-flush bridge. If the local
    // runtime has exited, let Windows close the window normally.
    if app
        .state::<RuntimeProcess>()
        .recovery_visible
        .load(Ordering::Acquire)
    {
        return;
    }
    api.prevent_close();
    let process = app.state::<RuntimeProcess>();
    if process.close_requested.swap(true, Ordering::AcqRel) {
        return;
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.eval("window.dispatchEvent(new Event('notespace:close-requested'))");
    }
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(CLOSE_HANDSHAKE_TIMEOUT).await;
        handle
            .state::<RuntimeProcess>()
            .close_requested
            .store(false, Ordering::Release);
    });
}

// The authenticated React UI may replace native decorations only after the
// Go sidecar has reached readiness. Startup/recovery always keep native chrome.
#[tauri::command]
pub(crate) fn activate_desktop_titlebar(app: AppHandle) -> Result<(), String> {
    let runtime = app.state::<RuntimeProcess>();
    if runtime.startup_in_flight.load(Ordering::Acquire)
        || runtime.recovery_visible.load(Ordering::Acquire)
        || runtime.stopping.load(Ordering::Acquire)
    {
        return Err("Desktop title bar is unavailable during startup or recovery".into());
    }
    let active = runtime
        .child
        .lock()
        .map_err(|_| "Notespace runtime state is unavailable".to_string())?
        .is_some();
    if !active {
        return Err("Notespace runtime is not ready".into());
    }
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Notespace desktop window is unavailable".to_string())?;
    window
        .set_decorations(false)
        .map_err(|error| format!("activate desktop title bar: {error}"))
}

// A native close request enters the same CloseRequested -> frontend durability
// handshake as the Windows close button. WebDriver can invoke this reliably;
// synthetic Alt+F4 is not a reliable OS close signal in WebView2 automation.
#[tauri::command]
pub(crate) fn request_desktop_close(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Notespace main desktop window is missing".to_string())?;
    window
        .close()
        .map_err(|error| format!("request native desktop close: {error}"))
}

#[tauri::command]
pub(crate) fn allow_desktop_close(app: AppHandle) -> Result<(), String> {
    if app
        .state::<RuntimeProcess>()
        .backup_in_flight
        .load(Ordering::Acquire)
    {
        return Err("Cannot close Notespace while a SQLite backup is in progress".into());
    }
    app.state::<RuntimeProcess>()
        .close_requested
        .store(false, Ordering::Release);
    // The shutdown handshake has finished flushing client edits. Stopping
    // the Go/SQLite sidecar may wait for outstanding HTTP connections; never
    // block Tauri's main WebView/event thread while waiting for its exit event.
    // Exit only AFTER the child has completed its graceful shutdown attempt.
    tauri::async_runtime::spawn_blocking(move || {
        stop_runtime(&app);
        app.exit(0);
    });
    Ok(())
}

#[tauri::command]
pub(crate) fn cancel_desktop_close(app: AppHandle) {
    app.state::<RuntimeProcess>()
        .close_requested
        .store(false, Ordering::Release);
}
