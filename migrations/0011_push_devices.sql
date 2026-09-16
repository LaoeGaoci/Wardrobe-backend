-- Migration number: 0011 	 2026-09-16T15:40:37.350Z
-- FCM push device registration.
--
-- Architecture:
--
-- Flutter
--   -> FCM registration token
--   -> POST /api/push/devices/register
--   -> push_devices
--
-- Cloudflare Worker
--   -> query receiver devices
--   -> FCM HTTP v1
--   -> Android

-- ============================================================
-- Push devices
-- ============================================================

CREATE TABLE push_devices (
    -- 后端内部 ID。
    id TEXT PRIMARY KEY,

    -- 当前设备 Token 属于哪个 Wardrobe 用户。
    user_id TEXT NOT NULL,

    -- 为未来支持 HMS / Xiaomi / OPPO 等保留 provider。
    --
    -- 当前只实现 FCM。
    provider TEXT NOT NULL
        DEFAULT 'fcm'
        CHECK (
            provider IN (
                'fcm'
            )
        ),

    -- 当前 Flutter 客户端只做 Android。
    platform TEXT NOT NULL
        CHECK (
            platform IN (
                'android'
            )
        ),

    -- Firebase Messaging registration token。
    --
    -- 一个 FCM Token 只能绑定一个当前用户。
    token TEXT NOT NULL UNIQUE,

    -- App 当前语言。
    --
    -- 后端按照设备语言生成后台通知，
    -- 因为 App 被关闭时不能依赖 Flutter BuildContext。
    locale TEXT NOT NULL
        DEFAULT 'zh_Hans'
        CHECK (
            locale IN (
                'en',
                'zh_Hans',
                'zh_Hant'
            )
        ),

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    -- 每次 Flutter 启动 / Token refresh /
    -- locale 改变时都会重新注册，
    -- 因此 updated_at 也可以表示设备最近活跃时间。
    updated_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_push_devices_user_id
    ON push_devices(
        user_id
    );

CREATE INDEX idx_push_devices_updated_at
    ON push_devices(
        updated_at
    );


-- ============================================================
-- Remove duplicate friend-request notification trigger
-- ============================================================
--
-- 当前 FriendRepository.createRequest()
-- 已经使用 D1 batch：
--
--   INSERT friend_requests
--   INSERT notifications
--
-- 而 0010 又创建了
-- trg_notification_friend_request_insert，
-- 会导致同一个 friend_request notification
-- 被插入两次。
--
-- 保留 Repository 的原子 batch，
-- 删除重复 trigger。
--

DROP TRIGGER IF EXISTS
    trg_notification_friend_request_insert;