use std::{
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Condvar, Mutex,
    },
    time::Duration,
};

use tauri::{AppHandle, Manager, RunEvent, Url, WindowEvent};
mod desktop_updates;
mod desktop_recovery;
mod desktop_ops;

use desktop_recovery::{desktop_recovery_diagnostics, list_desktop_recovery_points, list_desktop_manual_backups, create_desktop_manual_backup};

use desktop_updates::{cancel_prepared_desktop_update, install_prepared_desktop_update, prepare_desktop_update, desktop_updater_enabled, DesktopUpdateState};

use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

const READY_PREFIX: &str = "NOTESPACE_READY=";
const STARTUP_ERROR_PREFIX: &str = "NOTESPACE_STARTUP_ERROR=";
const STARTUP_TIMEOUT: Duration = Duration::from_secs(15);
const CLOSE_HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(10);
const SIDECAR_GRACEFUL_TIMEOUT: Duration = Duration::from_secs(12);
const DESKTOP_ADDR: &str = "127.0.0.1:0";

struct RuntimeProcess {
    child: Mutex<Option<CommandChild>>,
    close_requested: AtomicBool,
    startup_in_flight: AtomicBool,
    backup_in_flight: AtomicBool,
    recovery_visible: AtomicBool,
    generation: AtomicU64,
    stopping: AtomicBool,
    sidecar_exited: Arc<(Mutex<bool>, Condvar)>,
}

impl Default for RuntimeProcess {
    fn default() -> Self {
        Self {
            child: Mutex::new(None),
            close_requested: AtomicBool::new(false),
            startup_in_flight: AtomicBool::new(false),
            backup_in_flight: AtomicBool::new(false),
            recovery_visible: AtomicBool::new(false),
            generation: AtomicU64::new(0),
            stopping: AtomicBool::new(false),
            sidecar_exited: Arc::new((Mutex::new(false), Condvar::new())),
        }
    }
}

pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    // Only signed release builds carry a pinned public key and updater feed.
    // Dev / CI builds keep the plugin entirely unavailable.
    if desktop_updates::update_enabled() {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    let app = builder
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .manage(RuntimeProcess::default())
        .manage(DesktopUpdateState::default())
        .setup(|app| {
            launch_runtime(app.handle()).map_err(std::io::Error::other)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            allow_desktop_close,
            cancel_desktop_close,
            desktop_updater_enabled,
            prepare_desktop_update,
            install_prepared_desktop_update,
            cancel_prepared_desktop_update,
            desktop_retry_runtime,
            list_desktop_recovery_points,
            desktop_recovery_diagnostics,
            list_desktop_manual_backups,
            create_desktop_manual_backup
        ])
        .build(tauri::generate_context!())
        .expect("failed to build Notespace desktop runtime");

    app.run(|app, event| match event {
        RunEvent::WindowEvent {
            label,
            event: WindowEvent::CloseRequested { api, .. },
            ..
        } if label == "main" => request_close(app, api),
        RunEvent::Exit => stop_runtime(app),
        _ => {}
    });
}

// One in-flight runtime operation at a time. Do not restart an existing
// sidecar, as doing so could create simultaneous SQLite writers.
fn launch_runtime(app: &AppHandle) -> Result<(), String> {
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
        return Err("Notespace runtime is already active; restart is only available after failure".into());
    }
    let generation = state.generation.fetch_add(1, Ordering::AcqRel) + 1;
    desktop_ops::record(app, "runtime_start_requested");
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let result = start_runtime(&handle, generation).await;
        // Outdated child task must not overwrite current supervisor state.
        if handle.state::<RuntimeProcess>().generation.load(Ordering::Acquire) == generation {
            if let Err(error) = result {
                desktop_ops::record(&handle, "runtime_start_failed");
                stop_runtime(&handle);
                show_runtime_failure(&handle, &startup_error_message(&error));
            }
            handle.state::<RuntimeProcess>().startup_in_flight.store(false, Ordering::Release);
        }
    });
    Ok(())
}

#[tauri::command]
fn desktop_retry_runtime(app: AppHandle) -> Result<(), String> {
    desktop_ops::record(&app, "recovery_retry");
    launch_runtime(&app)
}

async fn start_runtime(app: &tauri::AppHandle, generation: u64) -> Result<(), String> {
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
    let command = app
        .shell()
        .sidecar("notespace-server")
        .map_err(|error| format!("resolve server sidecar: {error}"))?
        .env("NOTESPACE_ADDR", DESKTOP_ADDR)
        .env("NOTESPACE_DB", &database)
        .env("NOTESPACE_WEB_DIR", &web_dir)
        .env("NOTESPACE_PASSWORD", "")
        .env("NOTESPACE_PARENT_LIFECYCLE", "1")
        .env("NOTESPACE_READY_STDOUT", "1");

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
    if app.state::<RuntimeProcess>().generation.load(Ordering::Acquire) != generation {
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
    app.state::<RuntimeProcess>().startup_in_flight.store(false, Ordering::Release);
    app.state::<RuntimeProcess>().recovery_visible.store(false, Ordering::Release);
    desktop_ops::record(app, "runtime_ready");

    while let Some(event) = events.recv().await {
        if app.state::<RuntimeProcess>().generation.load(Ordering::Acquire) != generation { return Ok(()); }
        match event {
            CommandEvent::Stderr(bytes) => {
                eprintln!(
                    "notespace-server: {}",
                    String::from_utf8_lossy(&bytes).trim()
                );
            }
            CommandEvent::Error(error) => {
                desktop_ops::record(app, "runtime_exited");
                stop_runtime(app);
                show_runtime_failure(app, &format!("Local runtime error: {error}"));
                return Ok(());
            }
            CommandEvent::Terminated(payload) => {
                desktop_ops::record(app, "runtime_exited");
                clear_runtime(app);
                show_runtime_failure(app, &format!("Local runtime stopped: {payload:?}"));
                return Ok(());
            }
            _ => {}
        }
    }

    stop_runtime(app);
    show_runtime_failure(app, "Local runtime stopped unexpectedly.");
    Ok(())
}

fn runtime_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Some(path) = std::env::var_os("NOTESPACE_DESKTOP_TEST_DATA_DIR") {
        let path = PathBuf::from(path);
        if path.as_os_str().is_empty() {
            return Err("desktop test data directory cannot be empty".to_string());
        }
        return Ok(path);
    }
    app.path()
        .app_data_dir()
        .map_err(|error| format!("resolve app data directory: {error}"))
}

async fn wait_for_readiness(
    events: &mut tokio::sync::mpsc::Receiver<CommandEvent>,
    sidecar_exited: &Arc<(Mutex<bool>, Condvar)>,
) -> Result<Url, String> {
    let mut stderr_output = String::new();
    loop {
        let event = events
            .recv()
            .await
            .ok_or_else(|| "server sidecar closed without readiness".to_string())?;

        match event {
            CommandEvent::Stdout(bytes) => {
                let line = String::from_utf8_lossy(&bytes);
                if let Some(url) = parse_ready_line(line.trim())? {
                    return Ok(url);
                }
            }
            CommandEvent::Stderr(bytes) => {
                let chunk = String::from_utf8_lossy(&bytes);
                eprintln!("notespace-server: {}", chunk.trim());
                stderr_output.push_str(&chunk);
                if stderr_output.len() > 16_384 {
                    // Bound startup diagnostics; preserve later error messages.
                    stderr_output.clear();
                }
            }
            CommandEvent::Error(error) => {
                return Err(format!("server sidecar error: {error}"));
            }
            CommandEvent::Terminated(payload) => {
                mark_sidecar_exited(sidecar_exited);
                if let Some(detail) = startup_detail(&stderr_output) {
                    return Err(format!("server startup failed: {detail}"));
                }
                return Err(format!(
                    "server exited before readiness on {DESKTOP_ADDR}: {payload:?}"
                ));
            }
            _ => {}
        }
    }
}

fn startup_detail(stderr: &str) -> Option<&str> {
    stderr
        .lines()
        .filter_map(|line| line.trim().strip_prefix(STARTUP_ERROR_PREFIX))
        .filter(|detail| !detail.trim().is_empty())
        .last()
}

fn parse_ready_line(line: &str) -> Result<Option<Url>, String> {
    let Some(raw_url) = line.strip_prefix(READY_PREFIX) else {
        return Ok(None);
    };
    let url =
        Url::parse(raw_url).map_err(|error| format!("invalid server readiness URL: {error}"))?;
    if url.scheme() != "http" || url.host_str() != Some("127.0.0.1") {
        return Err("server readiness URL must use loopback HTTP".to_string());
    }
    // The server emits a privileged one-time bootstrap URL on its private
    // stdout pipe. Never log the token, even when parsing fails.
    if url.port().unwrap_or(0) == 0 || url.path() != "/__desktop_session" ||
        url.query_pairs().count() != 1 {
        return Err("server readiness URL must be a loopback desktop session bootstrap".into());
    }
    let key = url.query_pairs()
        .find(|(name, _)| name == "code")
        .map(|(_, value)| value.into_owned())
        .unwrap_or_default();
    if key.len() != 64 || !key.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("server readiness URL lacks a valid one-time bootstrap key".into());
    }
    Ok(Some(url))
}

fn startup_error_message(error: &str) -> String {
    if error.contains("before readiness") {
        return format!(
            "Unable to start the local Notespace server. Check system permissions and retry from the recovery screen."
        );
    }
    format!("Unable to start Notespace: {error}")
}

fn request_close(app: &AppHandle, api: tauri::CloseRequestApi) {
    // Do not terminate a backup worker mid-write. Completed backups are only
    // published after the worker has validated and closed its SQLite snapshot.
    if app.state::<RuntimeProcess>().backup_in_flight.load(Ordering::Acquire) {
        api.prevent_close();
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.eval("console.info('Notespace: backup in progress; finish backup before closing')");
        }
        return;
    }
    // The native recovery view has no React close-flush bridge. If the local
    // runtime has exited, let Windows close the window normally.
    if app.state::<RuntimeProcess>().recovery_visible.load(Ordering::Acquire) {
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

#[tauri::command]
fn allow_desktop_close(app: AppHandle) -> Result<(), String> {
    if app.state::<RuntimeProcess>().backup_in_flight.load(Ordering::Acquire) {
        return Err("Cannot close Notespace while a SQLite backup is in progress".into());
    }
    app.state::<RuntimeProcess>()
        .close_requested
        .store(false, Ordering::Release);
    stop_runtime(&app);
    app.exit(0);
    Ok(())
}

#[tauri::command]
fn cancel_desktop_close(app: AppHandle) {
    app.state::<RuntimeProcess>()
        .close_requested
        .store(false, Ordering::Release);
}

fn set_startup_status(app: &tauri::AppHandle, message: &str, error: bool) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let Ok(message) = serde_json::to_string(message) else {
        return;
    };
    let script = format!(
        "document.getElementById('status')?.setAttribute('data-error', '{error}'); document.getElementById('status').textContent = {message};"
    );
    let _ = window.eval(&script);
}

fn show_runtime_failure(app: &tauri::AppHandle, detail: &str) {
    app.state::<RuntimeProcess>().recovery_visible.store(true, Ordering::Release);
    let Some(window) = app.get_webview_window("main") else { return; };
    let Ok(message) = serde_json::to_string(detail) else { return; };
    // Error display is a native recovery view, not a page from the failing Go
    // server. Every user-data action is read-only. No automatic DB restore.
    let script = format!(r#"
      document.title = 'Notespace — Recovery';
      document.body.innerHTML = '<main style="max-width:560px;margin:8vh auto;padding:24px;font-family:system-ui,sans-serif;line-height:1.5"><h1>Notespace recovery</h1><p id="recovery-message" style="color:#9f3342;white-space:pre-wrap"></p><p>Notespace does not automatically replace your database. Unsaved changes may be lost; if the database is damaged, use a verified backup. Retrying does not restore data.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button id="recovery-retry">Retry startup</button><button id="recovery-points-button">Show recovery points</button><button id="recovery-diagnostics-button">Show diagnostics</button></div><pre id="recovery-details" style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:50vh;overflow:auto"></pre></main>';
      document.getElementById('recovery-message').textContent = {message};
      const details = document.getElementById('recovery-details');
      const invoke = (command) => window.__TAURI_INTERNALS__.invoke(command);
      document.getElementById('recovery-retry').onclick = async () => {{
        details.textContent = 'Starting Notespace…';
        try {{ await invoke('desktop_retry_runtime'); }}
        catch (e) {{ details.textContent = String(e); }}
      }};
      document.getElementById('recovery-points-button').onclick = async () => {{
        try {{
          const points = await invoke('list_desktop_recovery_points');
          details.textContent = points.length
            ? 'Recovery points (read-only; manual offline restore only):\\n' + points.map(p => p.name + ' (' + p.bytes + ' bytes)\\n' + p.path).join('\\n')
            : 'No pre-migration recovery snapshots found.';
        }} catch (e) {{ details.textContent = String(e); }}
      }};
      document.getElementById('recovery-diagnostics-button').onclick = async () => {{
        try {{ details.textContent = JSON.stringify(await invoke('desktop_recovery_diagnostics'), null, 2); }}
        catch (e) {{ details.textContent = String(e); }}
      }};
      document.querySelectorAll('#recovery-retry,#recovery-points-button,#recovery-diagnostics-button').forEach(b => {{
        b.style.cssText='padding:8px 14px;border:1px solid #aaa;border-radius:20px;background:white;color:#252630;cursor:pointer';
      }});
    "#);
    let _ = window.eval(&script);
}

fn clear_runtime(app: &tauri::AppHandle) {
    let process = app.state::<RuntimeProcess>();
    process.generation.fetch_add(1, Ordering::AcqRel);
    let Ok(mut slot) = process.child.lock() else {
        return;
    };
    *slot = None;
    mark_sidecar_exited(&process.sidecar_exited);
}

fn stop_runtime(app: &tauri::AppHandle) {
    let process = app.state::<RuntimeProcess>();
    // Invalidate the previous monitor BEFORE a restart can begin.
    if process.stopping.swap(true, Ordering::AcqRel) { return; }
    process.generation.fetch_add(1, Ordering::AcqRel);
    let child = {
        let Ok(mut slot) = process.child.lock() else {
            process.stopping.store(false, Ordering::Release);
            return;
        };
        slot.take()
    };
    if let Some(mut child) = child {
        if let Err(error) = child.write(b"shutdown\n") {
            eprintln!("notespace-server: graceful shutdown request failed: {error}");
            let _ = child.kill();
            mark_sidecar_exited(&process.sidecar_exited);
            process.stopping.store(false, Ordering::Release);
            return;
        }
        if wait_for_sidecar_exit(&process.sidecar_exited, SIDECAR_GRACEFUL_TIMEOUT) {
            eprintln!("notespace-server: exited gracefully");
        } else {
            eprintln!("notespace-server: graceful shutdown timed out; force-killing sidecar");
            let _ = child.kill();
        }
    }
    process.stopping.store(false, Ordering::Release);
}

fn wait_for_sidecar_exit(signal: &Arc<(Mutex<bool>, Condvar)>, timeout: Duration) -> bool {
    let (lock, notify) = &**signal;
    let exited = lock.lock().expect("sidecar exit signal lock poisoned");
    let (exited, _) = notify
        .wait_timeout_while(exited, timeout, |exited| !*exited)
        .expect("sidecar exit signal wait failed");
    *exited
}

fn reset_sidecar_exit(signal: &Arc<(Mutex<bool>, Condvar)>) {
    let (lock, _) = &**signal;
    if let Ok(mut exited) = lock.lock() {
        *exited = false;
    }
}

fn mark_sidecar_exited(signal: &Arc<(Mutex<bool>, Condvar)>) {
    let (lock, notify) = &**signal;
    if let Ok(mut exited) = lock.lock() {
        *exited = true;
        notify.notify_all();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn readiness_accepts_only_dynamic_loopback_bootstrap() {
        let key = "a".repeat(64);
        let valid = format!("NOTESPACE_READY=http://127.0.0.1:49201/__desktop_session?code={key}");
        let url = parse_ready_line(&valid).unwrap().unwrap();
        assert_eq!(url.port(), Some(49201));
        for invalid in [
            format!("NOTESPACE_READY=http://0.0.0.0:49201/__desktop_session?code={key}"),
            format!("NOTESPACE_READY=https://127.0.0.1:49201/__desktop_session?code={key}"),
            format!("NOTESPACE_READY=http://127.0.0.1:49201/"),
            format!("NOTESPACE_READY=http://127.0.0.1:49201/__desktop_session?code=bad"),
            format!("NOTESPACE_READY=http://127.0.0.1:49201/__desktop_session?code={key}&extra=1"),
        ] {
            assert!(parse_ready_line(&invalid).is_err(), "unexpected trusted bootstrap: {invalid}");
        }
        assert!(parse_ready_line("unrelated output").unwrap().is_none());
    }

    #[test]
    fn startup_database_failure_preserves_diagnostic_path() {
        let message = "NOTESPACE_STARTUP_ERROR=database startup failed; verified pre-upgrade snapshot retained at C:/Users/test/notespace.db.recovery/snapshot.db\n";
        let detail = startup_detail(message).expect("startup error marker must parse");
        let display = startup_error_message(&format!("server startup failed: {detail}"));
        assert!(display.contains("snapshot.db"));
        assert!(!display.contains("Another process may be using this port"));
    }

    #[test]
    fn startup_port_collision_has_actionable_recovery_message() {
        let message = startup_error_message("server exited before readiness on 127.0.0.1:49832");
        assert!(message.contains("Check system permissions"));
        assert!(!message.contains("49832"));
    }

    #[test]
    fn graceful_shutdown_timeout_exceeds_server_shutdown_window() {
        assert!(SIDECAR_GRACEFUL_TIMEOUT >= Duration::from_secs(10));
    }

    #[test]
    fn graceful_shutdown_wait_observes_exit_signal_and_timeout() {
        let exited = Arc::new((Mutex::new(false), Condvar::new()));
        assert!(!wait_for_sidecar_exit(&exited, Duration::from_millis(1)));

        mark_sidecar_exited(&exited);
        assert!(wait_for_sidecar_exit(&exited, Duration::from_millis(1)));
    }
}
