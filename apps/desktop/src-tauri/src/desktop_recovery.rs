use std::{fs, path::{Path, PathBuf}};

use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

use crate::{runtime_data_dir, RuntimeProcess};

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
    timestamp.ends_with('Z') && timestamp.len() == 26
        && timestamp[..25].bytes().all(|b| b.is_ascii_digit() || b == b'T' || b == b'.')
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
        "summary": "Diagnostics omit note content, full filesystem paths and secrets; recovery copies are never automatically restored."
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_partial_and_symlink_like_candidates() {
        assert!(!is_snapshot_name("pre-migration-incomplete.partial.db"));
        assert!(!is_snapshot_name("pre-migration-20261018T012345.123456789Z-xyz.db"));
        assert!(!is_snapshot_name("../pre-migration-20261018T012345.123456789Z-0123456789abcdef.db"));
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
