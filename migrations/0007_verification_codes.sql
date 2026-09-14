-- Migration number: 0007 	 2026-09-14T09:39:06.393Z
--
-- Unified email verification codes.
--
-- Used by:
--
-- 1. register
-- 2. password_reset
--
-- Verification codes are NEVER stored in plaintext.
-- The backend stores an HMAC-SHA256 digest instead.

CREATE TABLE verification_codes (
    id TEXT PRIMARY KEY NOT NULL,

    email TEXT NOT NULL,

    purpose TEXT NOT NULL
        CHECK (
            purpose IN (
                'register',
                'password_reset'
            )
        ),

    code_hash TEXT NOT NULL,

    -- Unix timestamp, seconds.
    expires_at INTEGER NOT NULL,

    -- Number of failed verification attempts.
    attempts INTEGER NOT NULL DEFAULT 0
        CHECK (attempts >= 0),

    -- NULL means the code has not been consumed.
    -- Unix timestamp when consumed.
    consumed_at INTEGER,

    -- Unix timestamp when created.
    created_at INTEGER NOT NULL
);

CREATE INDEX idx_verification_codes_email_purpose_created
ON verification_codes(
    email,
    purpose,
    created_at DESC
);

CREATE INDEX idx_verification_codes_expires_at
ON verification_codes(expires_at);