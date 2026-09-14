-- Migration number: 0006 	 2026-09-14T09:31:36.497Z
--
-- Password security:
--
-- token_version 用于使旧 JWT 失效。
--
-- 每次：
--
-- 1. 用户主动修改密码
-- 2. 用户通过忘记密码重置密码
--
-- 都将 token_version + 1。
--
-- JWT 内同时记录当前 token_version。
-- 请求时如果 JWT version 与数据库不一致，
-- 则认为该 JWT 已失效。

ALTER TABLE users
ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;