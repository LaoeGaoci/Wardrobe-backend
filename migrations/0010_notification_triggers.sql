-- Migration number: 0010 	 2026-09-16T08:41:52.651Z
-- Notification triggers + historical backfill.

-- ============================================================
-- Prevent duplicate friend/recommendation notifications
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS
idx_notifications_unique_resource
ON notifications(
    type,
    resource_id
)
WHERE resource_id IS NOT NULL;


-- ============================================================
-- Backfill existing pending friend requests
-- ============================================================

INSERT OR IGNORE INTO notifications (
    id,
    receiver_id,
    type,
    resource_id,
    sender_id,
    created_at
)
SELECT
    lower(hex(randomblob(16))),
    receiver_id,
    'friend_request',
    id,
    sender_id,
    created_at
FROM friend_requests
WHERE status = 'pending';


-- ============================================================
-- Backfill existing recommendations
-- ============================================================

INSERT OR IGNORE INTO notifications (
    id,
    receiver_id,
    type,
    resource_id,
    sender_id,
    created_at,
    read_at
)
SELECT
    lower(hex(randomblob(16))),
    receiver_id,
    'recommendation',
    id,
    sender_id,
    created_at,
    read_at
FROM recommendations;


-- ============================================================
-- Friend request created
-- ============================================================

CREATE TRIGGER IF NOT EXISTS
trg_notification_friend_request_insert
AFTER INSERT ON friend_requests
WHEN NEW.status = 'pending'
BEGIN
    INSERT OR IGNORE INTO notifications (
        id,
        receiver_id,
        type,
        resource_id,
        sender_id,
        created_at
    )
    VALUES (
        lower(hex(randomblob(16))),
        NEW.receiver_id,
        'friend_request',
        NEW.id,
        NEW.sender_id,
        NEW.created_at
    );
END;


-- ============================================================
-- Friend request accepted / rejected
-- ============================================================

CREATE TRIGGER IF NOT EXISTS
trg_notification_friend_request_status
AFTER UPDATE OF status ON friend_requests
WHEN NEW.status <> 'pending'
BEGIN
    UPDATE notifications
    SET read_at =
        COALESCE(
            read_at,
            CURRENT_TIMESTAMP
        )
    WHERE type = 'friend_request'
      AND resource_id = NEW.id
      AND receiver_id = NEW.receiver_id;
END;


-- ============================================================
-- Friend request cancelled
-- ============================================================

CREATE TRIGGER IF NOT EXISTS
trg_notification_friend_request_delete
AFTER DELETE ON friend_requests
BEGIN
    UPDATE notifications
    SET read_at =
        COALESCE(
            read_at,
            CURRENT_TIMESTAMP
        )
    WHERE type = 'friend_request'
      AND resource_id = OLD.id
      AND receiver_id = OLD.receiver_id;
END;


-- ============================================================
-- Recommendation created
-- ============================================================

CREATE TRIGGER IF NOT EXISTS
trg_notification_recommendation_insert
AFTER INSERT ON recommendations
BEGIN
    INSERT OR IGNORE INTO notifications (
        id,
        receiver_id,
        type,
        resource_id,
        sender_id,
        created_at,
        read_at
    )
    VALUES (
        lower(hex(randomblob(16))),
        NEW.receiver_id,
        'recommendation',
        NEW.id,
        NEW.sender_id,
        NEW.created_at,
        NEW.read_at
    );
END;


-- ============================================================
-- Recommendation marked as read
-- ============================================================

CREATE TRIGGER IF NOT EXISTS
trg_notification_recommendation_read
AFTER UPDATE OF read_at ON recommendations
WHEN NEW.read_at IS NOT NULL
BEGIN
    UPDATE notifications
    SET read_at =
        COALESCE(
            read_at,
            NEW.read_at,
            CURRENT_TIMESTAMP
        )
    WHERE type = 'recommendation'
      AND resource_id = NEW.id
      AND receiver_id = NEW.receiver_id;
END;