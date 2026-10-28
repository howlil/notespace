/** UI-only commands. Domain mutations remain owned by existing feature hooks. */
export const FOCUS_TASK_COMPOSER_EVENT = "notespace:focus-task-composer";

/** Notify a mounted Capture Queue when its local capture state changes. */
export const CAPTURE_QUEUE_CHANGED_EVENT = "notespace:capture-queue-changed";

/** Invalidate mounted Planning projections after a Task write; never carries Task data. */
export const PLANNING_TASK_CHANGED_EVENT = "notespace:planning-task-changed";
