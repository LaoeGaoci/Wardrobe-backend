-- Migration number: 0008 	 2026-09-15T10:32:19.498Z
-- Replace clothing "name" with the physical storage location.
-- Existing values are preserved by the column rename.

ALTER TABLE clothing
RENAME COLUMN name TO location;