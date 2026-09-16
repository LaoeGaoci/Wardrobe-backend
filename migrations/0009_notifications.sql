-- Migration number: 0009 	 2026-09-16T06:56:07.878Z
CREATE TABLE notifications (
    -- 专门用于后台拉取游标。
    seq INTEGER PRIMARY KEY AUTOINCREMENT,

    -- 对外公开 ID。
    id TEXT NOT NULL UNIQUE,

    -- 接收通知的用户。
    receiver_id TEXT NOT NULL,

    -- 通知类型。
    type TEXT NOT NULL
        CHECK (
            type IN (
                'friend_request',
                'recommendation',
                'system_notification'
            )
        ),

    -- 好友请求 / 推荐对应的数据 ID。
    --
    -- friend_request:
    -- friend_requests.id
    --
    -- recommendation:
    -- recommendations.id
    --
    -- system_notification:
    -- NULL
    resource_id TEXT,

    -- 发起人。
    --
    -- 好友请求 / 推荐：
    -- 对方用户 ID
    --
    -- 系统通知：
    -- NULL
    sender_id TEXT,

    -- 只有 system_notification 使用。
    title TEXT,

    -- 只有 system_notification 使用。
    message TEXT,

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    -- 以后如果做 App 内通知中心可以使用。
    read_at TEXT,

    FOREIGN KEY (receiver_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    FOREIGN KEY (sender_id)
        REFERENCES users(id)
        ON DELETE SET NULL
);

CREATE INDEX idx_notifications_receiver_seq
    ON notifications(
        receiver_id,
        seq
    );

CREATE INDEX idx_notifications_receiver_read
    ON notifications(
        receiver_id,
        read_at
    );

CREATE INDEX idx_notifications_resource
    ON notifications(
        type,
        resource_id
    );