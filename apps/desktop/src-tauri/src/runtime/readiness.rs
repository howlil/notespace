use super::shutdown::mark_sidecar_exited;
use std::{
    path::PathBuf,
    sync::{Arc, Condvar, Mutex},
};
use tauri::{Manager, Url};
use tauri_plugin_shell::process::CommandEvent;
pub(super) const DESKTOP_ADDR: &str = "127.0.0.1:0";
const READY_PREFIX: &str = "NOTESPACE_READY=";
const STARTUP_ERROR_PREFIX: &str = "NOTESPACE_STARTUP_ERROR=";
const DEVELOPMENT_DATA_DIRECTORY: &str = "dev";

fn configured_test_data_dir(path: Option<PathBuf>) -> Result<Option<PathBuf>, String> {
    let Some(path) = path else {
        return Ok(None);
    };
    if path.as_os_str().is_empty() {
        return Err("desktop test data directory cannot be empty".to_string());
    }
    Ok(Some(path))
}

fn profile_data_dir(app_data_dir: PathBuf, debug_build: bool) -> PathBuf {
    if debug_build {
        app_data_dir.join(DEVELOPMENT_DATA_DIRECTORY)
    } else {
        app_data_dir
    }
}

pub(crate) fn runtime_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Some(path) = configured_test_data_dir(
        std::env::var_os("NOTESPACE_DESKTOP_TEST_DATA_DIR").map(PathBuf::from),
    )? {
        return Ok(path);
    }
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("resolve app data directory: {error}"))?;
    Ok(profile_data_dir(app_data_dir, cfg!(debug_assertions)))
}

pub(crate) async fn wait_for_readiness(
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

pub(crate) fn startup_detail(stderr: &str) -> Option<&str> {
    stderr
        .lines()
        .filter_map(|line| line.trim().strip_prefix(STARTUP_ERROR_PREFIX))
        .filter(|detail| !detail.trim().is_empty())
        .last()
}

pub(crate) fn parse_ready_line(line: &str) -> Result<Option<Url>, String> {
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
    if url.port().unwrap_or(0) == 0
        || url.path() != "/__desktop_session"
        || url.query_pairs().count() != 1
    {
        return Err("server readiness URL must be a loopback desktop session bootstrap".into());
    }
    let key = url
        .query_pairs()
        .find(|(name, _)| name == "code")
        .map(|(_, value)| value.into_owned())
        .unwrap_or_default();
    if key.len() != 64 || !key.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("server readiness URL lacks a valid one-time bootstrap key".into());
    }
    Ok(Some(url))
}

pub(crate) fn startup_error_message(error: &str) -> String {
    if error.contains("before readiness") {
        return format!(
            "Unable to start the local Notespace server. Check system permissions and retry from the recovery screen."
        );
    }
    format!("Unable to start Notespace: {error}")
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn desktop_debug_data_is_separate_from_packaged_data() {
        let app_data = PathBuf::from("notespace-app-data");
        assert_eq!(
            profile_data_dir(app_data.clone(), false),
            PathBuf::from("notespace-app-data")
        );
        assert_eq!(
            profile_data_dir(app_data, true),
            PathBuf::from("notespace-app-data").join("dev")
        );
    }

    #[test]
    fn desktop_test_data_override_stays_exact() {
        let isolated = PathBuf::from("isolated-test-data");
        assert_eq!(
            configured_test_data_dir(Some(isolated.clone())).unwrap(),
            Some(isolated)
        );
        assert_eq!(configured_test_data_dir(None).unwrap(), None);
        assert!(configured_test_data_dir(Some(PathBuf::new())).is_err());
    }

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
            assert!(
                parse_ready_line(&invalid).is_err(),
                "unexpected trusted bootstrap: {invalid}"
            );
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
}
