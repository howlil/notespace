/** UI-only commands. Domain mutations remain owned by existing feature hooks. */
export const OPEN_QUICK_CAPTURE_EVENT = "notespace:open-quick-capture";
export const OPEN_LIBRARY_TOOLS_EVENT = "notespace:open-library-tools";
export const FOCUS_TASK_COMPOSER_EVENT = "notespace:focus-task-composer";

/** Notify a mounted Capture Queue when a global capture commits. */
export const CAPTURE_QUEUE_CHANGED_EVENT = "notespace:capture-queue-changed";

/** Invalidate mounted Planning projections after a Task write; never carries Task data. */
export const PLANNING_TASK_CHANGED_EVENT = "notespace:planning-task-changed";
