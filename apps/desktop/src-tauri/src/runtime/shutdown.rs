use super::RuntimeProcess;
use crate::preview_isolation::clear_allowed_loopback_origin;
use std::{
    sync::{atomic::Ordering, Arc, Condvar, Mutex},
    time::Duration,
};
use tauri::Manager;
const SIDECAR_GRACEFUL_TIMEOUT: Duration = Duration::from_secs(12);

// Claim a particular generation before touching its process slot. A stale
// Terminated event cannot erase a newer child spawned during installer recovery.
pub(crate) fn clear_runtime(app: &tauri::AppHandle, generation: u64) -> bool {
    let process = app.state::<RuntimeProcess>();
    if process.stopping.swap(true, Ordering::AcqRel) {
        return false;
    }
    if process.generation.load(Ordering::Acquire) != generation {
        process.stopping.store(false, Ordering::Release);
        return false;
    }
    process.generation.fetch_add(1, Ordering::AcqRel);
    let claimed = match process.child.lock() {
        Ok(mut slot) => {
            *slot = None;
            true
        }
        Err(_) => false,
    };
    mark_sidecar_exited(&process.sidecar_exited);
    clear_allowed_loopback_origin(app);
    process.stopping.store(false, Ordering::Release);
    claimed
}

pub(crate) fn stop_runtime(app: &tauri::AppHandle) {
    let _ = stop_runtime_expected(app, None);
}

pub(crate) fn stop_runtime_expected(app: &tauri::AppHandle, expected: Option<u64>) -> bool {
    let process = app.state::<RuntimeProcess>();
    if process.stopping.swap(true, Ordering::AcqRel) {
        return false;
    }
    if expected.is_some_and(|generation| process.generation.load(Ordering::Acquire) != generation) {
        process.stopping.store(false, Ordering::Release);
        return false;
    }
    process.generation.fetch_add(1, Ordering::AcqRel);
    let child = {
        let Ok(mut slot) = process.child.lock() else {
            process.stopping.store(false, Ordering::Release);
            return false;
        };
        slot.take()
    };
    if let Some(mut child) = child {
        if let Err(error) = child.write(b"shutdown\n") {
            eprintln!("notespace-server: graceful shutdown request failed: {error}");
            let _ = child.kill();
            mark_sidecar_exited(&process.sidecar_exited);
            process.stopping.store(false, Ordering::Release);
            return true;
        }
        if wait_for_sidecar_exit(&process.sidecar_exited, SIDECAR_GRACEFUL_TIMEOUT) {
            eprintln!("notespace-server: exited gracefully");
        } else {
            eprintln!("notespace-server: graceful shutdown timed out; force-killing sidecar");
            let _ = child.kill();
        }
    }
    process.stopping.store(false, Ordering::Release);
    true
}

pub(crate) fn wait_for_sidecar_exit(
    signal: &Arc<(Mutex<bool>, Condvar)>,
    timeout: Duration,
) -> bool {
    let (lock, notify) = &**signal;
    let exited = lock.lock().expect("sidecar exit signal lock poisoned");
    let (exited, _) = notify
        .wait_timeout_while(exited, timeout, |exited| !*exited)
        .expect("sidecar exit signal wait failed");
    *exited
}

pub(crate) fn reset_sidecar_exit(signal: &Arc<(Mutex<bool>, Condvar)>) {
    let (lock, _) = &**signal;
    if let Ok(mut exited) = lock.lock() {
        *exited = false;
    }
}

pub(crate) fn mark_sidecar_exited(signal: &Arc<(Mutex<bool>, Condvar)>) {
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
