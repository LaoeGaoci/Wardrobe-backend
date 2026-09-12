-- Migration number: 0005 	 2026-09-12T16:08:53.481Z
-- Keep username/email uniqueness aligned
-- with backend comparisons.
--
-- Apply this migration only after confirming
-- there are no existing rows that differ
-- only by letter case.

CREATE UNIQUE INDEX IF NOT EXISTS
idx_users_username_nocase
ON users(username COLLATE NOCASE);

CREATE UNIQUE INDEX IF NOT EXISTS
idx_users_email_nocase
ON users(email COLLATE NOCASE);