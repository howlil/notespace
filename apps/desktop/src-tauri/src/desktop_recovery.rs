use std::{fs, path::{Path, PathBuf}, sync::atomic::{AtomicBool, Ordering}};

use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;

use crate::{runtime_data_dir, desktop_ops, RuntimeProcess};

#[derive(Debug, Clone)]
pub struct RecoveryPoint {
    name: String,
    bytes: u64,
    // Display only; never take an arbitrary filesystem path back from the UI.
    path: String,
}

fn is_snapshot_name(name: &str) -> bool {
    let Some(stem) = name.strip_prefix("pre-migration-").and_then(|s| s.strip_suffix(".db")) else {
        return false;
    };
    // M1 format: UTC timestamp and 16 hex random bytes. Do not trust file
    // extension alone: .partial files or user symlinks must not be offered.
    let Some((timestamp, random)) = stem.rsplit_once('-') else {
        return false;
    };
    timestamp.len() == 26 && timestamp.as_bytes()[25] == b'Z'
        && timestamp.as_bytes()[..25].iter().all(|b| b.is_ascii_digit() || *b == b'T' || *b == b'.')
        && random.len() == 16 && random.bytes().all(|b| b.is_ascii_hexdigit())
}

fn read_recovery_points(db: &Path) -> Result<Vec<RecoveryPoint>, String> {
    let directory = PathBuf::from(format!("{}.recovery", db.display()));
    let meta = match fs::symlink_metadata(&directory) {
        Ok(meta) => meta,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(error) => return Err(format!("Read recovery directory: {error}")),
    };
    if !meta.is_dir() || meta.file_type().is_symlink() {
        return Err("Recovery path is not a real directory".into());
    }
    let mut entries = vec![];
    let scan = fs::read_dir(&directory).map_err(|error| format!("List recovery directory: {error}"))?;
    for item in scan {
        let item = item.map_err(|error| format!("Read recovery entry: {error}"))?;
        let name = item.file_name().to_string_lossy().into_owned();
        if !is_snapshot_name(&name) {
            continue;
        }
        let info = fs::symlink_metadata(item.path())
            .map_err(|error| format!("Stat recovery snapshot: {error}"))?;
        if !info.is_file() || info.file_type().is_symlink() || info.len() == 0 {
            continue;
        }
        entries.push(RecoveryPoint {
            name,
            bytes: info.len(),
            path: item.path().display().to_string(),
        });
    }
    entries.sort_by(|a, b| b.name.cmp(&a.name));
    entries.truncate(50);
    Ok(entries)
}

#[tauri::command]
pub fn list_desktop_recovery_points(app: AppHandle) -> Result<Vec<Value>, String> {
    let db = runtime_data_dir(&app)?.join("notespace.db");
    let points = read_recovery_points(&db)?;
    Ok(points.into_iter().map(|p| json!({
        "name": p.name, "bytes": p.bytes, "path": p.path,
    })).collect())
}

#[tauri::command]
pub fn desktop_recovery_diagnostics(app: AppHandle) -> Result<Value, String> {
    let points = read_recovery_points(&runtime_data_dir(&app)?.join("notespace.db"))?;
    let state = app.state::<RuntimeProcess>();
    let running = state.child.lock().map_err(|_| "Runtime lock unavailable".to_string())?.is_some();
    Ok(json!({
        "appVersion": app.package_info().version.to_string(),
        "platform": std::env::consts::OS,
        "runtimeActive": running,
        "recoveryPointCount": points.len(),
        "recentEvents": desktop_ops::recent(&app),
        "summary": "Diagnostics omit note content, full filesystem paths and secrets; recovery copies are never automatically restored."
    }))
}

// The interactive backup worker reads SQLite using VACUUM INTO. It does not
// call the normal Go startup/migration path. The worker returns a path inside
// the app-owned .backups directory; the UI is never allowed to choose a path.
struct BackupGuard<'a>(&'a AtomicBool);
impl Drop for BackupGuard<'_> {
    fn drop(&mut self) { self.0.store(false, Ordering::Release); }
}

#[tauri::command]
pub async fn create_desktop_manual_backup(app: AppHandle) -> Result<Value, String> {
    let process = app.state::<RuntimeProcess>();
    if process.startup_in_flight.load(Ordering::Acquire) {
        return Err("Wait until library startup finishes".into());
    }
    if process.child.lock().map_err(|_| "Runtime lock unavailable".to_string())?.is_none() {
        return Err("The local library is not running; use the offline recovery instructions".into());
    }
    if process.backup_in_flight.swap(true, Ordering::AcqRel) {
        return Err("A backup is already in progress".into());
    }
    let _guard = BackupGuard(&process.backup_in_flight);
    desktop_ops::record(&app, "backup_requested");
    let db = runtime_data_dir(&app)?.join("notespace.db");
    let output = app
        .shell()
        .sidecar("notespace-server")
        .map_err(|error| format!("Locate SQLite backup worker: {error}"))?
        .env("NOTESPACE_DB", &db)
        .env("NOTESPACE_SNAPSHOT_ONLY", "1")
        .output()
        .await
        .map_err(|error| format!("Create verified SQLite backup: {error}"))?;
    if !output.status.success() {
        desktop_ops::record(&app, "backup_failed");
        // Sidecar stderr can include internal filesystem details; avoid
        // displaying it to the frontend or copying it into a diagnostics file.
        return Err("Backup failed; canonical library was not changed. Check the available disk space and retry.".into());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let raw = stdout.lines()
        .find_map(|line| line.strip_prefix("NOTESPACE_SNAPSHOT="))
        .ok_or_else(|| "Backup worker returned no recovery point".to_string())?;
    let candidate = PathBuf::from(raw);
    let expected_dir = PathBuf::from(format!("{}.backups", db.display()));
    if candidate.parent() != Some(expected_dir.as_path()) {
        return Err("Backup worker returned a path outside the owned backup directory".into());
    }
    let name = candidate.file_name().and_then(|x| x.to_str()).ok_or("Invalid backup filename")?;
    if !is_manual_name(name) { return Err("Backup worker returned an unexpected filename".into()); }
    let meta = fs::symlink_metadata(&candidate).map_err(|error| format!("Verify saved backup: {error}"))?;
    if !meta.is_file() || meta.file_type().is_symlink() || meta.len() == 0 {
        return Err("Backup worker did not produce a regular nonempty backup file".into());
    }
    desktop_ops::record(&app, "backup_success");
    Ok(json!({"name":name,"path":candidate.display().to_string(),"bytes":meta.len()}))
}

fn is_manual_name(name: &str) -> bool {
    if !name.starts_with("manual-") || !name.ends_with(".db") { return false; }
    let mapped = name.replacen("manual-", "pre-migration-", 1);
    is_snapshot_name(&mapped)
}

#[tauri::command]
pub fn list_desktop_manual_backups(app: AppHandle) -> Result<Vec<Value>, String> {
    let db = runtime_data_dir(&app)?.join("notespace.db");
    let directory = PathBuf::from(format!("{}.backups", db.display()));
    let meta = match fs::symlink_metadata(&directory) {
        Ok(meta) => meta,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(error) => return Err(format!("Read backup directory: {error}")),
    };
    if !meta.is_dir() || meta.file_type().is_symlink() {
        return Err("Backup path is not a real directory".into());
    }
    let mut result = Vec::new();
    for entry in fs::read_dir(&directory).map_err(|error| format!("List backups: {error}"))? {
        let entry = entry.map_err(|error| format!("Read backup entry: {error}"))?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if !is_manual_name(&name) { continue; }
        let meta = fs::symlink_metadata(entry.path()).map_err(|error| format!("Inspect backup: {error}"))?;
        if meta.is_file() && !meta.file_type().is_symlink() && meta.len() > 0 {
            result.push(json!({"name": name, "bytes": meta.len(), "path": entry.path().display().to_string()}));
        }
    }
    result.sort_by(|a,b| b["name"].as_str().cmp(&a["name"].as_str()));
    result.truncate(50);
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_partial_and_symlink_like_candidates() {
        assert!(!is_snapshot_name("pre-migration-incomplete.partial.db"));
        assert!(!is_snapshot_name("pre-migration-20261018T012345.123456789Z-xyz.db"));
        assert!(!is_snapshot_name("../pre-migration-20261018T012345.123456789Z-0123456789abcdef.db"));
        assert!(!is_snapshot_name("pre-migration-20261018T012345.12345678éZ-0123456789abcdef.db"));
        assert!(is_snapshot_name("pre-migration-20261018T012345.123456789Z-0123456789abcdef.db"));
    }

    #[test]
    fn only_lists_real_nonempty_owned_files() {
        let root = std::env::temp_dir().join(format!("notespace-recovery-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let db = root.join("notespace.db");
        let recovery = PathBuf::from(format!("{}.recovery", db.display()));
        fs::create_dir_all(&recovery).unwrap();
        let valid = recovery.join("pre-migration-20261018T012345.123456789Z-0123456789abcdef.db");
        fs::write(&valid, b"snapshot").unwrap();
        fs::write(recovery.join(".part.partial.db"), b"ignored").unwrap();
        fs::write(recovery.join("pre-migration-20261018T012345.123456789Z-fedcba9876543210.db"), []).unwrap();
        let points = read_recovery_points(&db).unwrap();
        assert_eq!(points.len(), 1);
        assert_eq!(points[0].name, valid.file_name().unwrap().to_string_lossy());
        fs::remove_dir_all(&root).unwrap();
    }
}
