use std::{
    fs,
    sync::Mutex,
};

use tauri::{Manager, RunEvent, Url};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

const READY_PREFIX: &str = "NOTESPACE_READY=";

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

    while let Some(event) = events.recv().await {
        match event {
            CommandEvent::Stdout(bytes) => {
                let line = String::from_utf8_lossy(&bytes);
                let line = line.trim();
                if let Some(raw_url) = line.strip_prefix(READY_PREFIX) {
                    let url = Url::parse(raw_url)
                        .map_err(|error| format!("invalid server readiness URL: {error}"))?;
                    let window = app
                        .get_webview_window("main")
                        .ok_or_else(|| "main window is unavailable".to_string())?;
                    window
                        .navigate(url)
                        .map_err(|error| format!("open Notespace runtime: {error}"))?;
                    return Ok(());
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

    Err("server sidecar closed without readiness".to_string())
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

fn stop_runtime(app: &tauri::AppHandle) {
    let process = app.state::<RuntimeProcess>();
    let Ok(mut slot) = process.child.lock() else {
        return;
    };
    if let Some(child) = slot.take() {
        let _ = child.kill();
    }
}
