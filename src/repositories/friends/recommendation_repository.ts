import type {
	ClothingRow,
} from '../../types/clothing/clothing';

import type {
	RecommendationItemClothingRow,
	RecommendationWithUsersRow,
} from '../../types/friends/recommendation';

export class RecommendationRepository {
	constructor(
		private readonly db: D1Database,
	) {}

	// ============================================================
	// Create
	// ============================================================

	/**
	 * 创建推荐。
	 *
	 * 一次 batch 写入：
	 *
	 * recommendations
	 *
	 * +
	 *
	 * recommendation_items
	 */
	async create(
		input: {
			id: string;
			senderId: string;
			receiverId: string;
			message: string;
			clothingIds: string[];
		},
	): Promise<void> {
		const statements = [
			/**
			 * 推荐主表。
			 */
			this.db
				.prepare(`
					INSERT INTO recommendations (
						id,
						sender_id,
						receiver_id,
						message
					)
					VALUES (?, ?, ?, ?)
				`)
				.bind(
					input.id,
					input.senderId,
					input.receiverId,
					input.message,
				),

			/**
			 * 推荐中的每件衣物。
			 */
			...input.clothingIds.map(
				(clothingId) =>
					this.db
						.prepare(`
							INSERT INTO recommendation_items (
								recommendation_id,
								clothing_id
							)
							VALUES (?, ?)
						`)
						.bind(
							input.id,
							clothingId,
						),
			),
		];

		await this.db.batch(
			statements,
		);
	}

	// ============================================================
	// Received history
	// ============================================================

	/**
	 * 查询“我收到的所有推荐”。
	 *
	 * 包含：
	 *
	 * 未读
	 * 已读
	 *
	 * 最新的排在最前面。
	 */
	async findReceived(
		receiverId: string,
	): Promise<
		RecommendationWithUsersRow[]
	> {
		const result =
			await this.db
				.prepare(`
					SELECT
						r.id,
						r.sender_id,
						r.receiver_id,
						r.message,
						r.created_at,
						r.read_at,

						sender.username
							AS sender_username,

						sender.email
							AS sender_email,

						sender.avatar_url
							AS sender_avatar_url,

						receiver.username
							AS receiver_username,

						receiver.email
							AS receiver_email,

						receiver.avatar_url
							AS receiver_avatar_url

					FROM recommendations r

					INNER JOIN users sender
						ON sender.id = r.sender_id

					INNER JOIN users receiver
						ON receiver.id = r.receiver_id

					WHERE r.receiver_id = ?

					ORDER BY
						r.created_at DESC,
						r.id DESC
				`)
				.bind(
					receiverId,
				)
				.all<
					RecommendationWithUsersRow
				>();

		return result.results ?? [];
	}

	// ============================================================
	// Sent history
	// ============================================================

	/**
	 * 查询“我发出的推荐”。
	 */
	async findSent(
		senderId: string,
	): Promise<
		RecommendationWithUsersRow[]
	> {
		const result =
			await this.db
				.prepare(`
					SELECT
						r.id,
						r.sender_id,
						r.receiver_id,
						r.message,
						r.created_at,
						r.read_at,

						sender.username
							AS sender_username,

						sender.email
							AS sender_email,

						sender.avatar_url
							AS sender_avatar_url,

						receiver.username
							AS receiver_username,

						receiver.email
							AS receiver_email,

						receiver.avatar_url
							AS receiver_avatar_url

					FROM recommendations r

					INNER JOIN users sender
						ON sender.id = r.sender_id

					INNER JOIN users receiver
						ON receiver.id = r.receiver_id

					WHERE r.sender_id = ?

					ORDER BY
						r.created_at DESC,
						r.id DESC
				`)
				.bind(
					senderId,
				)
				.all<
					RecommendationWithUsersRow
				>();

		return result.results ?? [];
	}

	// ============================================================
	// Unread
	// ============================================================

	/**
	 * 查询当前用户的所有未读推荐。
	 */
	async findUnread(
		receiverId: string,
	): Promise<
		RecommendationWithUsersRow[]
	> {
		const result =
			await this.db
				.prepare(`
					SELECT
						r.id,
						r.sender_id,
						r.receiver_id,
						r.message,
						r.created_at,
						r.read_at,

						sender.username
							AS sender_username,

						sender.email
							AS sender_email,

						sender.avatar_url
							AS sender_avatar_url,

						receiver.username
							AS receiver_username,

						receiver.email
							AS receiver_email,

						receiver.avatar_url
							AS receiver_avatar_url

					FROM recommendations r

					INNER JOIN users sender
						ON sender.id = r.sender_id

					INNER JOIN users receiver
						ON receiver.id = r.receiver_id

					WHERE r.receiver_id = ?
					  AND r.read_at IS NULL

					ORDER BY
						r.created_at DESC,
						r.id DESC
				`)
				.bind(
					receiverId,
				)
				.all<
					RecommendationWithUsersRow
				>();

		return result.results ?? [];
	}

	/**
	 * 获取未读推荐数量。
	 */
	async countUnread(
		receiverId: string,
	): Promise<number> {
		const row =
			await this.db
				.prepare(`
					SELECT
						COUNT(*) AS count
					FROM recommendations
					WHERE receiver_id = ?
					  AND read_at IS NULL
				`)
				.bind(
					receiverId,
				)
				.first<{
					count: number;
				}>();

		return Number(
			row?.count ?? 0,
		);
	}

	// ============================================================
	// Detail
	// ============================================================

	async findAccessibleById(
		recommendationId: string,
		userId: string,
	): Promise<
		RecommendationWithUsersRow | null
	> {
		const row =
			await this.db
				.prepare(`
					SELECT
						r.id,
						r.sender_id,
						r.receiver_id,
						r.message,
						r.created_at,
						r.read_at,

						sender.username
							AS sender_username,

						sender.email
							AS sender_email,

						sender.avatar_url
							AS sender_avatar_url,

						receiver.username
							AS receiver_username,

						receiver.email
							AS receiver_email,

						receiver.avatar_url
							AS receiver_avatar_url

					FROM recommendations r

					INNER JOIN users sender
						ON sender.id = r.sender_id

					INNER JOIN users receiver
						ON receiver.id = r.receiver_id

					WHERE r.id = ?
					  AND (
							r.sender_id = ?
							OR
							r.receiver_id = ?
					  )

					LIMIT 1
				`)
				.bind(
					recommendationId,
					userId,
					userId,
				)
				.first<
					RecommendationWithUsersRow
				>();

		return row ?? null;
	}

	async findReceivedById(
		recommendationId: string,
		receiverId: string,
	): Promise<
		RecommendationWithUsersRow | null
	> {
		const row =
			await this.db
				.prepare(`
					SELECT
						r.id,
						r.sender_id,
						r.receiver_id,
						r.message,
						r.created_at,
						r.read_at,

						sender.username
							AS sender_username,

						sender.email
							AS sender_email,

						sender.avatar_url
							AS sender_avatar_url,

						receiver.username
							AS receiver_username,

						receiver.email
							AS receiver_email,

						receiver.avatar_url
							AS receiver_avatar_url

					FROM recommendations r

					INNER JOIN users sender
						ON sender.id = r.sender_id

					INNER JOIN users receiver
						ON receiver.id = r.receiver_id

					WHERE r.id = ?
					  AND r.receiver_id = ?

					LIMIT 1
				`)
				.bind(
					recommendationId,
					receiverId,
				)
				.first<
					RecommendationWithUsersRow
				>();

		return row ?? null;
	}

	// ============================================================
	// Read
	// ============================================================

	async markRead(
		recommendationId: string,
		receiverId: string,
	): Promise<void> {
		await this.db
			.prepare(`
				UPDATE recommendations
				SET read_at = CURRENT_TIMESTAMP
				WHERE id = ?
				  AND receiver_id = ?
				  AND read_at IS NULL
			`)
			.bind(
				recommendationId,
				receiverId,
			)
			.run();
	}

	// ============================================================
	// Recommendation clothing
	// ============================================================

	async findItemsByRecommendationIds(
		recommendationIds: string[],
	): Promise<
		RecommendationItemClothingRow[]
	> {
		if (
			recommendationIds.length === 0
		) {
			return [];
		}

		const placeholders =
			recommendationIds
				.map(
					() => '?',
				)
				.join(', ');

		const result =
			await this.db
				.prepare(`
					SELECT
						ri.recommendation_id,

						c.id,
						c.owner_id,
						c.location,
						c.brand,
						c.category,
						c.color,
						c.season,
						c.price,
						c.image_url,
						c.visibility,
						c.created_at,
						c.updated_at

					FROM recommendation_items ri

					INNER JOIN clothing c
						ON c.id = ri.clothing_id

					WHERE
						ri.recommendation_id
						IN (${placeholders})

					ORDER BY
						c.created_at DESC,
						c.id ASC
				`)
				.bind(
					...recommendationIds,
				)
				.all<
					RecommendationItemClothingRow
				>();

		return result.results ?? [];
	}

	// ============================================================
	// Validate clothing before sending
	// ============================================================

	async findPublicOwnedClothingByIds(
		ownerId: string,
		clothingIds: string[],
	): Promise<ClothingRow[]> {
		if (
			clothingIds.length === 0
		) {
			return [];
		}

		const placeholders =
			clothingIds
				.map(
					() => '?',
				)
				.join(', ');

		const result =
			await this.db
				.prepare(`
					SELECT
						id,
						owner_id,
						location,
						brand,
						category,
						color,
						season,
						price,
						image_url,
						visibility,
						created_at,
						updated_at
					FROM clothing
					WHERE owner_id = ?
					  AND visibility = 'public'
					  AND id IN (${placeholders})
				`)
				.bind(
					ownerId,
					...clothingIds,
				)
				.all<ClothingRow>();

		return result.results ?? [];
	}

	// ============================================================
	// Recommendation image authorization
	// ============================================================

	async findAccessibleItemClothing(
		recommendationId: string,
		clothingId: string,
		userId: string,
	): Promise<ClothingRow | null> {
		const row =
			await this.db
				.prepare(`
					SELECT
						c.id,
						c.owner_id,
						c.location,
						c.brand,
						c.category,
						c.color,
						c.season,
						c.price,
						c.image_url,
						c.visibility,
						c.created_at,
						c.updated_at

					FROM recommendation_items ri

					INNER JOIN recommendations r
						ON r.id =
						   ri.recommendation_id

					INNER JOIN clothing c
						ON c.id =
						   ri.clothing_id

					WHERE
						ri.recommendation_id = ?
						AND ri.clothing_id = ?
						AND (
							r.sender_id = ?
							OR
							r.receiver_id = ?
						)

					LIMIT 1
				`)
				.bind(
					recommendationId,
					clothingId,
					userId,
					userId,
				)
				.first<ClothingRow>();

		return row ?? null;
	}
}
