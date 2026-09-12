-- Migration number: 0001 	 2026-09-12T12:37:22.084Z
CREATE TABLE users (
    id TEXT PRIMARY KEY NOT NULL,

    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,

    -- Backend-only field.
    -- Never expose this through the AppUser Flutter model.
    password_hash TEXT NOT NULL,

    avatar_url TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_username
    ON users(username);

CREATE INDEX idx_users_email
    ON users(email);