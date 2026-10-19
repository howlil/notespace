// Explicit command manifest required by Tauri 2 remote-origin ACL.
// The app loads its authenticated Go sidecar from an OS-assigned 127.0.0.1 port.
// Exposing a command in invoke_handler alone does not grant loopback permission.
fn main() {
    let attributes = tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "request_desktop_close",
            "allow_desktop_close",
            "cancel_desktop_close",
            "desktop_updater_enabled",
            "prepare_desktop_update",
            "install_prepared_desktop_update",
            "cancel_prepared_desktop_update",
            "desktop_retry_runtime",
            "list_desktop_recovery_points",
            "desktop_recovery_diagnostics",
            "list_desktop_manual_backups",
            "create_desktop_manual_backup",
        ]),
    );
    tauri_build::try_build(attributes).expect("failed to generate Notespace desktop ACL");
}
