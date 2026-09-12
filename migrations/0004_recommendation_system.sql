-- Migration number: 0004 	 2026-09-12T12:38:30.860Z
CREATE TABLE recommendations (
    id TEXT PRIMARY KEY NOT NULL,

    sender_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,

    message TEXT NOT NULL,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- NULL means unread.
    -- Non-NULL means the recommendation has been opened.
    read_at TEXT,

    FOREIGN KEY (sender_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    FOREIGN KEY (receiver_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CHECK (sender_id != receiver_id)
);

CREATE INDEX idx_recommendations_receiver
    ON recommendations(receiver_id);

CREATE INDEX idx_recommendations_receiver_unread
    ON recommendations(receiver_id, read_at);

CREATE INDEX idx_recommendations_sender
    ON recommendations(sender_id);


CREATE TABLE recommendation_items (
    recommendation_id TEXT NOT NULL,
    clothing_id TEXT NOT NULL,

    PRIMARY KEY (recommendation_id, clothing_id),

    FOREIGN KEY (recommendation_id)
        REFERENCES recommendations(id)
        ON DELETE CASCADE,

    FOREIGN KEY (clothing_id)
        REFERENCES clothing(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_recommendation_items_clothing
    ON recommendation_items(clothing_id);