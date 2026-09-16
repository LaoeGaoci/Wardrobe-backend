import type {
	PublicUser,
} from '../user/user';

/**
 * 好友申请在数据库中的状态。
 *
 * pending:
 *   申请正在等待处理。
 *
 * accepted:
 *   对方已经接受。
 *
 * rejected:
 *   对方已经拒绝。
 */
export type FriendRequestStatus =
	| 'pending'
	| 'accepted'
	| 'rejected';

/**
 * Flutter 端使用的好友状态。
 *
 * none:
 *   没有好友关系，也没有未处理申请。
 *
 * friends:
 *   已经是好友。
 *
 * requestSent:
 *   当前用户已经给对方发送申请。
 *
 * requestReceived:
 *   对方已经给当前用户发送申请。
 */
export type FriendStatus =
	| 'none'
	| 'friends'
	| 'requestSent'
	| 'requestReceived';

// ============================================================
// D1 Rows
// ============================================================

/**
 * friend_requests 表原始行。
 */
export interface FriendRequestRow {
	id: string;

	sender_id: string;

	receiver_id: string;

	message: string | null;

	status: FriendRequestStatus;

	created_at: string;

	updated_at: string;
}

/**
 * friendships 表原始行。
 *
 * 注意：
 *
 * 好友关系是双向保存的。
 *
 * A 与 B 成为好友以后：
 *
 * A -> B
 * B -> A
 *
 * 会分别存在一条记录。
 *
 * 这样 A 给 B 的 nickname 和
 * B 给 A 的 nickname 可以互不影响。
 */
export interface FriendshipRow {
	id: string;

	owner_id: string;

	friend_id: string;

	nickname: string;

	created_at: string;
}

// ============================================================
// Repository JOIN Rows
// ============================================================

/**
 * 好友列表查询结果。
 *
 * friendships JOIN users。
 */
export interface FriendWithUserRow {
	friendship_id: string;

	friend_id: string;

	nickname: string;

	friendship_created_at: string;

	username: string;

	email: string;

	avatar_url: string | null;
}

/**
 * 好友申请 JOIN sender user + receiver user。
 *
 * 这样查询申请列表时不需要再对每个申请
 * 单独 GET /api/users/:id。
 */
export interface FriendRequestWithUsersRow {
	id: string;

	sender_id: string;

	receiver_id: string;

	message: string | null;

	status: FriendRequestStatus;

	created_at: string;

	updated_at: string;

	sender_username: string;

	sender_email: string;

	sender_avatar_url: string | null;

	receiver_username: string;

	receiver_email: string;

	receiver_avatar_url: string | null;
}

// ============================================================
// API DTO
// ============================================================

/**
 * 返回给 Flutter 的好友。
 *
 * 数据库叫 nickname，
 * API 对外统一叫 remark，
 * 与你现在 Flutter FriendRelation 保持一致。
 */
export interface FriendRelation {
	user: PublicUser;

	remark: string;

	createdAt: string;
}

/**
 * 返回给 Flutter 的好友申请。
 *
 * 无论是收到还是发出的申请，
 * 都返回 fromUser 和 toUser，
 * 前端模型会比较简单。
 */
export interface FriendRequest {
	id: string;

	fromUser: PublicUser;

	toUser: PublicUser;

	message: string;

	createdAt: string;
}