use tauri::{Manager, RunEvent, WindowEvent};
mod diagnostics;
mod recovery;
mod runtime;
mod updates;
mod window;

use recovery::{
    create_desktop_manual_backup, desktop_recovery_diagnostics, list_desktop_manual_backups,
    list_desktop_recovery_points,
};
use runtime::{desktop_retry_runtime, launch_runtime, stop_runtime, RuntimeProcess};
use updates::{
    cancel_prepared_desktop_update, desktop_updater_enabled, install_prepared_desktop_update,
    prepare_desktop_update, DesktopUpdateState,
};
use window::{
    activate_desktop_titlebar, allow_desktop_close, cancel_desktop_close, request_close,
    request_desktop_close,
};

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
    if updates::update_enabled() {
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
            request_desktop_close,
            activate_desktop_titlebar,
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
