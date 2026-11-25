CREATE TABLE planning_create_requests (
  kind TEXT NOT NULL CHECK(kind IN ('task', 'milestone')),
  request_key TEXT NOT NULL CHECK(length(request_key) BETWEEN 1 AND 128),
  payload_hash TEXT NOT NULL,
  record_id TEXT NOT NULL,
  PRIMARY KEY(kind, request_key)
);
-- Preserve request tombstones after deletion; a delayed retry must not recreate
-- a Task or Milestone the user has already deleted.
