-- Existing sessions and deleted-session tombstones are preserved.
-- Revision zero means the legacy unversioned heartbeat protocol.
ALTER TABLE activity_sessions
  ADD COLUMN revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0);
