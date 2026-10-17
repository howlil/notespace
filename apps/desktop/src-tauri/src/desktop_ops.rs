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

// Read bounded tails newest-first across active and archived journals.
fn recent_in_dir(directory: &std::path::Path) -> Vec<Value> {
    const ALLOWED: [&str; 10] = [
        "runtime_start_requested","runtime_ready","runtime_start_failed",
        "runtime_exited","recovery_retry","backup_requested","backup_success",
        "backup_failed","update_install_requested","update_install_failed",
    ];
    let mut entries = Vec::new();
    for filename in ["events.jsonl", "events.1.jsonl", "events.2.jsonl", "events.3.jsonl"] {
        let path = directory.join(filename);
        let Ok(info) = fs::symlink_metadata(&path) else { continue; };
        if !info.is_file() || info.file_type().is_symlink() || info.len() > 512 * 1024 { continue; }
        let Ok(mut file) = fs::File::open(path) else { continue; };
        let mut content = String::new();
        if file.read_to_string(&mut content).is_err() { continue; }
        for line in content.lines().rev() {
            if entries.len() == 20 { return entries; }
            let Ok(value) = serde_json::from_str::<Value>(line) else { continue; };
            let Some(code) = value.get("event").and_then(Value::as_str) else { continue; };
            let Some(time) = value.get("unixSeconds").and_then(Value::as_u64) else { continue; };
            if ALLOWED.contains(&code) {
                entries.push(json!({"event":code,"unixSeconds":time}));
            }
        }
    }
    entries
}

pub fn recent(app: &AppHandle) -> Vec<Value> {
    let Ok(directory) = event_dir(app) else { return vec![]; };
    recent_in_dir(&directory)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn recent_reads_rotated_journals_in_newest_first_order() {
        let dir = std::env::temp_dir().join(format!("notespace-ops-read-{}-{}",std::process::id(),SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("events.1.jsonl"), "{\"unixSeconds\":1,\"event\":\"runtime_start_failed\"}\n").unwrap();
        fs::write(dir.join("events.jsonl"), "{\"unixSeconds\":2,\"event\":\"runtime_ready\"}\n").unwrap();
        let events = recent_in_dir(&dir);
        assert_eq!(events.len(), 2);
        assert_eq!(events[0]["unixSeconds"], 2);
        assert_eq!(events[1]["unixSeconds"], 1);
        fs::remove_dir_all(&dir).unwrap();
    }
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
