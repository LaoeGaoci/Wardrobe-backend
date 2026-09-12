-- Migration number: 0002 	 2026-09-12T12:37:44.845Z
CREATE TABLE clothing (
    id TEXT PRIMARY KEY NOT NULL,

    owner_id TEXT NOT NULL,

    name TEXT NOT NULL,
    brand TEXT,

    category TEXT NOT NULL,
    color TEXT NOT NULL,
    season TEXT NOT NULL,

    price REAL,

    image_url TEXT,

    visibility TEXT NOT NULL DEFAULT 'private'
        CHECK (visibility IN ('public', 'private')),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (owner_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_clothing_owner
    ON clothing(owner_id);

CREATE INDEX idx_clothing_owner_visibility
    ON clothing(owner_id, visibility);