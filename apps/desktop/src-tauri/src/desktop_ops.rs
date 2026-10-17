use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

// Retained diagnostic events are intentionally a fixed allowlist. No dynamic
// errors, API data, note contents, filesystem paths or secrets are persisted.
const MAX_LOG_BYTES: u64 = 256 * 1024;
const RETAINED_FILES: usize = 3;

fn event_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app.path().app_log_dir()
        .map_err(|error| format!("resolve diagnostic log directory: {error}"))?
        .join("ops");
    fs::create_dir_all(&directory).map_err(|error| format!("create diagnostics directory: {error}"))?;
    let meta = fs::symlink_metadata(&directory).map_err(|error| error.to_string())?;
    if !meta.is_dir() || meta.file_type().is_symlink() {
        return Err("Unsafe diagnostic directory".to_string());
    }
    Ok(directory)
}

fn rotate(directory: &std::path::Path, base: &std::path::Path) -> std::io::Result<()> {
    let len = match fs::symlink_metadata(base) {
        Ok(info) => {
            if !info.is_file() || info.file_type().is_symlink() {
                return Err(std::io::Error::other("diagnostic log is not a regular file"));
            }
            info.len()
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => 0,
        Err(error) => return Err(error),
    };
    if len <= MAX_LOG_BYTES { return Ok(()); }
    let oldest = directory.join(format!("events.{RETAINED_FILES}.jsonl"));
    let _ = fs::remove_file(oldest);
    for index in (1..RETAINED_FILES).rev() {
        let source = directory.join(format!("events.{index}.jsonl"));
        let dest = directory.join(format!("events.{}.jsonl", index + 1));
        if source.exists() { fs::rename(source, dest)?; }
    }
    fs::rename(base, directory.join("events.1.jsonl"))
}

pub fn record(app: &AppHandle, code: &'static str) {
    let allowed = [
        "runtime_start_requested", "runtime_ready", "runtime_start_failed",
        "runtime_exited", "recovery_retry", "backup_requested", "backup_success",
        "backup_failed", "update_install_requested", "update_install_failed",
    ];
    if !allowed.contains(&code) { return; }
    if let Err(error) = write_event(app, code) {
        // No raw path or event body ever leaves this debug channel.
        eprintln!("notespace diagnostics: event not recorded ({:?})", error.kind());
    }
}

fn write_event(app: &AppHandle, code: &'static str) -> std::io::Result<()> {
    let directory = event_dir(app).map_err(std::io::Error::other)?;
    let base = directory.join("events.jsonl");
    rotate(&directory, &base)?;
    let mut file = OpenOptions::new().append(true).create(true).open(&base)?;
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    let entry = json!({"unixSeconds":now,"event":code});
    writeln!(file, "{entry}")?;
    Ok(())
}

pub fn recent(app: &AppHandle) -> Vec<Value> {
    let Ok(directory) = event_dir(app) else { return vec![]; };
    let base = directory.join("events.jsonl");
    let Ok(mut file) = fs::File::open(base) else { return vec![]; };
    let Ok(info) = file.metadata() else { return vec![]; };
    // Read a bounded tail, never the entire historical log.
    if info.len() > 512 * 1024 { return vec![]; }
    let mut content = String::new();
    if file.read_to_string(&mut content).is_err() { return vec![]; }
    content.lines().rev().take(20).filter_map(|line| {
        let value: Value = serde_json::from_str(line).ok()?;
        let code = value.get("event")?.as_str()?;
        // Avoid displaying injected file content if the log was tampered with.
        if ![
            "runtime_start_requested","runtime_ready","runtime_start_failed",
            "runtime_exited","recovery_retry","backup_requested","backup_success",
            "backup_failed","update_install_requested","update_install_failed"
        ].contains(&code) { return None; }
        Some(json!({"event":code,"unixSeconds":value.get("unixSeconds")?.as_u64()?}))
    }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rotation_is_bounded_and_keeps_prior_log() {
        let dir = std::env::temp_dir().join(format!("notespace-ops-{}-{}",std::process::id(),SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()));
        fs::create_dir_all(&dir).unwrap();
        let base = dir.join("events.jsonl");
        fs::write(&base, vec![b'x'; (MAX_LOG_BYTES+5) as usize]).unwrap();
        rotate(&dir, &base).unwrap();
        assert!(dir.join("events.1.jsonl").is_file());
        fs::remove_dir_all(&dir).unwrap();
    }
}
