use std::{
    fs,
    sync::Mutex,
    time::Duration,
};

use tauri::{Manager, RunEvent, Url};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

const READY_PREFIX: &str = "NOTESPACE_READY=";
const STARTUP_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Default)]
struct RuntimeProcess {
    child: Mutex<Option<CommandChild>>,
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

    let app = builder
        .plugin(tauri_plugin_shell::init())
        .manage(RuntimeProcess::default())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) = start_runtime(&handle).await {
                    set_startup_status(&handle, &format!("Unable to start Notespace: {error}"), true);
                    stop_runtime(&handle);
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build Notespace desktop runtime");

    app.run(|app, event| {
        if matches!(event, RunEvent::Exit) {
            stop_runtime(app);
        }
    });
}

async fn start_runtime(app: &tauri::AppHandle) -> Result<(), String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("resolve app data directory: {error}"))?;
    fs::create_dir_all(&data_dir)
        .map_err(|error| format!("create app data directory: {error}"))?;

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
        .env("NOTESPACE_ADDR", "127.0.0.1:0")
        .env("NOTESPACE_DB", &database)
        .env("NOTESPACE_WEB_DIR", &web_dir)
        .env("NOTESPACE_PASSWORD", "");

    let (mut events, child) = command
        .spawn()
        .map_err(|error| format!("spawn server sidecar: {error}"))?;

    {
        let process = app.state::<RuntimeProcess>();
        let mut slot = process
            .child
            .lock()
            .map_err(|_| "desktop runtime process lock poisoned".to_string())?;
        *slot = Some(child);
    }

    let ready_url = tokio::time::timeout(STARTUP_TIMEOUT, wait_for_readiness(&mut events))
        .await
        .map_err(|_| "server readiness timed out".to_string())??;
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window is unavailable".to_string())?;
    window
        .navigate(ready_url)
        .map_err(|error| format!("open Notespace runtime: {error}"))?;

    while let Some(event) = events.recv().await {
        match event {
            CommandEvent::Stderr(bytes) => {
                eprintln!("notespace-server: {}", String::from_utf8_lossy(&bytes).trim());
            }
            CommandEvent::Error(error) => {
                stop_runtime(app);
                show_runtime_failure(app, &format!("Local runtime error: {error}"));
                return Ok(());
            }
            CommandEvent::Terminated(payload) => {
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

async fn wait_for_readiness(
    events: &mut tokio::sync::mpsc::Receiver<CommandEvent>,
) -> Result<Url, String> {
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
                eprintln!("notespace-server: {}", String::from_utf8_lossy(&bytes).trim());
            }
            CommandEvent::Error(error) => {
                return Err(format!("server sidecar error: {error}"));
            }
            CommandEvent::Terminated(payload) => {
                return Err(format!("server exited before readiness: {payload:?}"));
            }
            _ => {}
        }
    }
}

fn parse_ready_line(line: &str) -> Result<Option<Url>, String> {
    let Some(raw_url) = line.strip_prefix(READY_PREFIX) else {
        return Ok(None);
    };
    let url = Url::parse(raw_url)
        .map_err(|error| format!("invalid server readiness URL: {error}"))?;
    if url.scheme() != "http" || url.host_str() != Some("127.0.0.1") {
        return Err("server readiness URL must use loopback HTTP".to_string());
    }
    Ok(Some(url))
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
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let message = format!("{detail} Close and reopen Notespace.");
    let Ok(message) = serde_json::to_string(&message) else {
        return;
    };
    let script = format!(
        "document.title='Notespace — Runtime stopped'; document.body.innerHTML='<main id=\"notespace-runtime-failure\" style=\"min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#f7f8fa;color:#252630\"><div style=\"display:grid;gap:8px;text-align:center\"><h1 style=\"margin:0;font-size:18px\">Notespace</h1><p id=\"runtime-message\" style=\"margin:0;color:#b13e4b;font-size:13px\"></p></div></main>'; document.getElementById('runtime-message').textContent={message};"
    );
    let _ = window.eval(&script);
}

fn clear_runtime(app: &tauri::AppHandle) {
    let process = app.state::<RuntimeProcess>();
    if let Ok(mut slot) = process.child.lock() {
        *slot = None;
    }
}

fn stop_runtime(app: &tauri::AppHandle) {
    let process = app.state::<RuntimeProcess>();
    let Ok(mut slot) = process.child.lock() else {
        return;
    };
    if let Some(child) = slot.take() {
        let _ = child.kill();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn readiness_accepts_only_loopback_http() {
        let url = parse_ready_line("NOTESPACE_READY=http://127.0.0.1:49152")
            .expect("ready line should parse")
            .expect("ready line should contain a URL");
        assert_eq!(url.as_str(), "http://127.0.0.1:49152/");

        assert!(parse_ready_line("NOTESPACE_READY=http://0.0.0.0:49152").is_err());
        assert!(parse_ready_line("NOTESPACE_READY=https://127.0.0.1:49152").is_err());
        assert!(parse_ready_line("unrelated log line").expect("non-ready log should be ignored").is_none());
    }
}
