use super::{
    readiness::{runtime_data_dir, startup_error_message, wait_for_readiness, DESKTOP_ADDR},
    shutdown::{
        clear_runtime, mark_sidecar_exited, reset_sidecar_exit, stop_runtime, stop_runtime_expected,
    },
    RuntimeProcess,
};
use crate::{diagnostics, recovery::show_runtime_failure};
use std::{fs, sync::atomic::Ordering, time::Duration};
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::{process::CommandEvent, ShellExt};
const STARTUP_TIMEOUT: Duration = Duration::from_secs(15);

fn configured_development_server_url(value: Option<String>) -> Option<String> {
    value.filter(|url| !url.trim().is_empty())
}

// One in-flight runtime operation at a time. Do not restart an existing
// sidecar, as doing so could create simultaneous SQLite writers.
pub(crate) fn launch_runtime(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<RuntimeProcess>();
    if state.stopping.load(Ordering::Acquire) {
        return Err("Notespace is still shutting down its previous runtime".into());
    }
    if state.startup_in_flight.swap(true, Ordering::AcqRel) {
        return Err("Notespace runtime is already starting".into());
    }
    let active = match state.child.lock() {
        Ok(slot) => slot.is_some(),
        Err(_) => {
            state.startup_in_flight.store(false, Ordering::Release);
            return Err("Notespace process state is unavailable".into());
        }
    };
    if active {
        state.startup_in_flight.store(false, Ordering::Release);
        return Err(
            "Notespace runtime is already active; restart is only available after failure".into(),
        );
    }
    let generation = state.generation.fetch_add(1, Ordering::AcqRel) + 1;
    diagnostics::record(app, "runtime_start_requested");
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let result = start_runtime(&handle, generation).await;
        // Outdated child task must not overwrite current supervisor state.
        if handle
            .state::<RuntimeProcess>()
            .generation
            .load(Ordering::Acquire)
            == generation
        {
            if let Err(error) = result {
                diagnostics::record(&handle, "runtime_start_failed");
                stop_runtime(&handle);
                show_runtime_failure(&handle, &startup_error_message(&error));
            }
            handle
                .state::<RuntimeProcess>()
                .startup_in_flight
                .store(false, Ordering::Release);
        }
    });
    Ok(())
}

#[tauri::command]
pub(crate) fn desktop_retry_runtime(app: AppHandle) -> Result<(), String> {
    diagnostics::record(&app, "recovery_retry");
    launch_runtime(&app)
}

pub(crate) async fn start_runtime(app: &tauri::AppHandle, generation: u64) -> Result<(), String> {
    let data_dir = runtime_data_dir(app)?;
    fs::create_dir_all(&data_dir).map_err(|error| format!("create app data directory: {error}"))?;

    let web_dir = app
        .path()
        .resource_dir()
        .map_err(|error| format!("resolve resource directory: {error}"))?
        .join("web");
    if !web_dir.join("index.html").is_file() {
        return Err(format!("web resources missing at {}", web_dir.display()));
    }

    let database = data_dir.join("notespace.db");
    let origin_file = data_dir.join("notespace.db.desktop-origin");
    let command = app
        .shell()
        .sidecar("notespace-server")
        .map_err(|error| format!("resolve server sidecar: {error}"))?
        .env("NOTESPACE_ADDR", DESKTOP_ADDR)
        .env("NOTESPACE_DB", &database)
        .env("NOTESPACE_DESKTOP_ORIGIN_FILE", &origin_file)
        .env("NOTESPACE_WEB_DIR", &web_dir)
        .env("NOTESPACE_PASSWORD", "")
        .env("NOTESPACE_PARENT_LIFECYCLE", "1")
        .env("NOTESPACE_READY_STDOUT", "1");
    // The desktop WebView navigates to the authenticated sidecar origin. The
    // Vite proxy is an explicit development opt-in: debug release checks do
    // not run a Vite server and must instead serve packaged web assets.
    let command = if let Some(url) =
        configured_development_server_url(std::env::var("NOTESPACE_DEV_SERVER_URL").ok())
    {
        command.env("NOTESPACE_DEV_SERVER_URL", url)
    } else {
        command
    };

    let (mut events, child) = command
        .spawn()
        .map_err(|error| format!("spawn server sidecar: {error}"))?;

    let sidecar_exited = app.state::<RuntimeProcess>().sidecar_exited.clone();
    reset_sidecar_exit(&sidecar_exited);
    {
        let process = app.state::<RuntimeProcess>();
        let mut slot = process
            .child
            .lock()
            .map_err(|_| "desktop runtime process lock poisoned".to_string())?;
        *slot = Some(child);
    }

    let ready_url = tokio::time::timeout(
        STARTUP_TIMEOUT,
        wait_for_readiness(&mut events, &sidecar_exited),
    )
    .await
    .map_err(|_| "server readiness timed out".to_string())??;
    if app
        .state::<RuntimeProcess>()
        .generation
        .load(Ordering::Acquire)
        != generation
    {
        return Ok(());
    }
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window is unavailable".to_string())?;
    window
        .navigate(ready_url)
        .map_err(|error| format!("open Notespace runtime: {error}"))?;
    // Startup is complete; the task continues monitoring sidecar events.
    // Backups are allowed during normal operation, not during migration.
    app.state::<RuntimeProcess>()
        .startup_in_flight
        .store(false, Ordering::Release);
    app.state::<RuntimeProcess>()
        .recovery_visible
        .store(false, Ordering::Release);
    diagnostics::record(app, "runtime_ready");

    while let Some(event) = events.recv().await {
        if app
            .state::<RuntimeProcess>()
            .generation
            .load(Ordering::Acquire)
            != generation
        {
            // stop_runtime_expected() invalidates the old generation BEFORE
            // requesting a graceful shutdown. The old receiver must still
            // consume its own Terminated event and wake that child's waiter.
            // Otherwise every normal close waits 12 seconds and force-kills
            // an already exited Go/SQLite sidecar.
            if matches!(&event, CommandEvent::Terminated(_)) {
                mark_sidecar_exited(&sidecar_exited);
                return Ok(());
            }
            continue; // stale events must never affect the next generation
        }
        match event {
            CommandEvent::Stderr(bytes) => {
                eprintln!(
                    "notespace-server: {}",
                    String::from_utf8_lossy(&bytes).trim()
                );
            }
            CommandEvent::Error(error) => {
                diagnostics::record(app, "runtime_exited");
                if stop_runtime_expected(app, Some(generation)) {
                    show_runtime_failure(app, &format!("Local runtime error: {error}"));
                }
                return Ok(());
            }
            CommandEvent::Terminated(payload) => {
                diagnostics::record(app, "runtime_exited");
                if clear_runtime(app, generation) {
                    show_runtime_failure(app, &format!("Local runtime stopped: {payload:?}"));
                }
                return Ok(());
            }
            _ => {}
        }
    }

    // The command channel can also close without a Terminated payload.
    // There can be no further events from this specific child at this point.
    mark_sidecar_exited(&sidecar_exited);
    if stop_runtime_expected(app, Some(generation)) {
        show_runtime_failure(app, "Local runtime stopped unexpectedly.");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn development_proxy_requires_an_explicit_url() {
        assert_eq!(configured_development_server_url(None), None);
        assert_eq!(configured_development_server_url(Some("".into())), None);
        assert_eq!(configured_development_server_url(Some("  ".into())), None);
        assert_eq!(
            configured_development_server_url(Some("http://127.0.0.1:3000".into())),
            Some("http://127.0.0.1:3000".into())
        );
    }
}
