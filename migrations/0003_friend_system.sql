-- Migration number: 0003 	 2026-09-12T12:38:12.051Z
CREATE TABLE friend_requests (
    id TEXT PRIMARY KEY NOT NULL,

    sender_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,

    message TEXT,

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'rejected')),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (sender_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    FOREIGN KEY (receiver_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CHECK (sender_id != receiver_id)
);

CREATE INDEX idx_friend_requests_receiver_status
    ON friend_requests(receiver_id, status);

CREATE INDEX idx_friend_requests_sender_status
    ON friend_requests(sender_id, status);


CREATE TABLE friendships (
    id TEXT PRIMARY KEY NOT NULL,

    owner_id TEXT NOT NULL,
    friend_id TEXT NOT NULL,

    nickname TEXT NOT NULL DEFAULT '',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (owner_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    FOREIGN KEY (friend_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CHECK (owner_id != friend_id),

    UNIQUE (owner_id, friend_id)
);

CREATE INDEX idx_friendships_owner
    ON friendships(owner_id);

CREATE INDEX idx_friendships_friend
    ON friendships(friend_id);