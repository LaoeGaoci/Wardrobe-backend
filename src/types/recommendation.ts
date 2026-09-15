import type {
	Clothing,
	ClothingVisibility,
} from './clothing';

import type {
	PublicUser,
} from './user';

// ============================================================
// D1 recommendation row
// ============================================================

/**
 * recommendations 表基础数据。
 */
export interface RecommendationRow {
	id: string;

	sender_id: string;

	receiver_id: string;

	message: string;

	created_at: string;

	/**
	 * NULL:
	 *   未读
	 *
	 * 非 NULL:
	 *   已经打开过推荐
	 */
	read_at: string | null;
}

// ============================================================
// Recommendation + User JOIN
// ============================================================

/**
 * 查询推荐时直接 JOIN：
 *
 * sender user
 * receiver user
 *
 * 防止 Flutter 为每条推荐继续发送：
 *
 * GET /api/users/:id
 *
 * 造成 N+1 请求。
 */
export interface RecommendationWithUsersRow {
	id: string;

	sender_id: string;

	receiver_id: string;

	message: string;

	created_at: string;

	read_at: string | null;

	// -------------------------
	// Sender
	// -------------------------

	sender_username: string;

	sender_email: string;

	sender_avatar_url: string | null;

	// -------------------------
	// Receiver
	// -------------------------

	receiver_username: string;

	receiver_email: string;

	receiver_avatar_url: string | null;
}

// ============================================================
// Recommendation item + Clothing JOIN
// ============================================================

/**
 * recommendation_items
 *
 * JOIN
 *
 * clothing
 *
 * 查询结果。
 */
export interface RecommendationItemClothingRow {
	recommendation_id: string;

	id: string;

	owner_id: string;

	location: string;

	brand: string | null;

	category: string;

	color: string;

	season: string;

	price: number | null;

	/**
	 * 实际保存的是 R2 object key。
	 */
	image_url: string | null;

	visibility: ClothingVisibility;

	created_at: string;

	updated_at: string;
}

// ============================================================
// Flutter DTO
// ============================================================

/**
 * 最终返回 Flutter 的推荐对象。
 */
export interface Recommendation {
	id: string;

	/**
	 * 谁发送的推荐。
	 */
	fromUser: PublicUser;

	/**
	 * 推荐给谁。
	 */
	toUser: PublicUser;

	/**
	 * 推荐包含的衣物。
	 */
	clothes: Clothing[];

	/**
	 * 推荐留言。
	 */
	message: string;

	createdAt: string;

	/**
	 * 未读时为 null。
	 */
	readAt: string | null;

	/**
	 * 给 Flutter 使用的便利字段。
	 */
	isRead: boolean;
}
