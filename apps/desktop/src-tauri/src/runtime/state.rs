use std::sync::{
    atomic::{AtomicBool, AtomicU64},
    Arc, Condvar, Mutex,
};
use tauri_plugin_shell::process::CommandChild;

pub(crate) struct RuntimeProcess {
    pub(crate) child: Mutex<Option<CommandChild>>,
    pub(crate) close_requested: AtomicBool,
    pub(crate) startup_in_flight: AtomicBool,
    pub(crate) backup_in_flight: AtomicBool,
    pub(crate) recovery_visible: AtomicBool,
    pub(crate) generation: AtomicU64,
    pub(crate) stopping: AtomicBool,
    pub(crate) sidecar_exited: Arc<(Mutex<bool>, Condvar)>,
}

impl Default for RuntimeProcess {
    fn default() -> Self {
        Self {
            child: Mutex::new(None),
            close_requested: AtomicBool::new(false),
            startup_in_flight: AtomicBool::new(false),
            backup_in_flight: AtomicBool::new(false),
            recovery_visible: AtomicBool::new(false),
            generation: AtomicU64::new(0),
            stopping: AtomicBool::new(false),
            sidecar_exited: Arc::new((Mutex::new(false), Condvar::new())),
        }
    }
}
