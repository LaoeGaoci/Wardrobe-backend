import {
	FriendRepository,
} from '../repositories/friend_repository';

import {
	RecommendationRepository,
} from '../repositories/recommendation_repository';

import {
	UserRepository,
} from '../repositories/user_repository';

import {
	generateId,
} from '../utils/id';

import type {
	Clothing,
	ClothingRow,
} from '../types/clothing';

import type {
	PublicUser,
} from '../types/user';

import type {
	Recommendation,
	RecommendationItemClothingRow,
	RecommendationWithUsersRow,
} from '../types/recommendation';

// ============================================================
// Validation limits
// ============================================================

/**
 * 与 Flutter 推荐留言输入框保持一致。
 */
const MESSAGE_MAX_LENGTH =
	200;

/**
 * 防止一次请求塞入过多 clothing id。
 *
 * 当前 UI 实际一般只有几件，
 * 20 已经足够。
 */
const MAX_CLOTHING_ITEMS =
	20;

// ============================================================
// Service
// ============================================================

export class RecommendationService {
	private readonly repository:
		RecommendationRepository;

	private readonly friendRepository:
		FriendRepository;

	private readonly userRepository:
		UserRepository;

	constructor(
		db: D1Database,
	) {
		this.repository =
			new RecommendationRepository(
				db,
			);

		this.friendRepository =
			new FriendRepository(
				db,
			);

		this.userRepository =
			new UserRepository(
				db,
			);
	}

	// ============================================================
	// Send
	// ============================================================

	/**
	 * 发送推荐。
	 *
	 * POST /api/recommendations
	 *
	 * Body:
	 *
	 * {
	 *   "toUserId": "...",
	 *   "clothingIds": [
	 *     "...",
	 *     "..."
	 *   ],
	 *   "message": "..."
	 * }
	 */
	async sendRecommendation(
		currentUserId: string,
		input: unknown,
	): Promise<Recommendation> {
		const body =
			requireObject(
				input,
			);

		const toUserId =
			requireText(
				body.toUserId,
				'toUserId is required',
			);

		const message =
			requireText(
				body.message,
				'Recommendation message is required',
			);

		const clothingIds =
			parseClothingIds(
				body.clothingIds,
			);

		// --------------------------------------------------------
		// Message length
		// --------------------------------------------------------

		if (
			message.length >
			MESSAGE_MAX_LENGTH
		) {
			throw new RecommendationServiceError(
				`Recommendation message must be at most ${MESSAGE_MAX_LENGTH} characters`,
				400,
			);
		}

		// --------------------------------------------------------
		// Cannot recommend to self
		// --------------------------------------------------------

		if (
			currentUserId ===
			toUserId
		) {
			throw new RecommendationServiceError(
				'Cannot recommend clothing to yourself',
				400,
			);
		}

		// --------------------------------------------------------
		// Receiver must exist
		// --------------------------------------------------------

		const receiverExists =
			await this.userRepository
				.existsById(
					toUserId,
				);

		if (!receiverExists) {
			throw new RecommendationServiceError(
				'User not found',
				404,
			);
		}

		// --------------------------------------------------------
		// Must be friends
		// --------------------------------------------------------

		const isFriend =
			await this.friendRepository
				.isFriend(
					currentUserId,
					toUserId,
				);

		if (!isFriend) {
			throw new RecommendationServiceError(
				'You can only recommend clothing to friends',
				403,
			);
		}

		// --------------------------------------------------------
		// Validate clothing
		// --------------------------------------------------------

		/**
		 * 所有衣物必须：
		 *
		 * owner_id = receiver
		 * visibility = public
		 */
		const availableClothes =
			await this.repository
				.findPublicOwnedClothingByIds(
					toUserId,
					clothingIds,
				);

		/**
		 * 因为 clothingIds 已经去重，
		 * 数量不一致意味着：
		 *
		 * - 某件不存在
		 * - 某件不是好友的
		 * - 某件现在是 private
		 */
		if (
			availableClothes.length !==
			clothingIds.length
		) {
			throw new RecommendationServiceError(
				'One or more clothing items are unavailable',
				400,
			);
		}

		// --------------------------------------------------------
		// Create
		// --------------------------------------------------------

		const recommendationId =
			generateId();

		await this.repository
			.create({
				id:
					recommendationId,

				senderId:
					currentUserId,

				receiverId:
					toUserId,

				message,

				clothingIds,
			});

		/**
		 * 创建成功后重新查询，
		 * 返回完整 Recommendation DTO。
		 */
		return this.getRecommendation(
			currentUserId,
			recommendationId,
		);
	}

	// ============================================================
	// Home unread stack
	// ============================================================

	/**
	 * 获取主页所有未读推荐。
	 *
	 * GET /api/recommendations/unread
	 *
	 * 返回顺序：
	 *
	 * recommendations[0]
	 * =
	 * 最新推荐信。
	 *
	 * Flutter 可以直接：
	 *
	 * unreadRecommendations.first
	 *
	 * 作为最上层信封。
	 */
	async listUnread(
		currentUserId: string,
	): Promise<Recommendation[]> {
		const headers =
			await this.repository
				.findUnread(
					currentUserId,
				);

		return this.buildRecommendations(
			headers,
		);
	}

	/**
	 * GET
	 * /api/recommendations/unread-count
	 */
	async getUnreadCount(
		currentUserId: string,
	): Promise<number> {
		return this.repository
			.countUnread(
				currentUserId,
			);
	}

	// ============================================================
	// History
	// ============================================================

	/**
	 * 收到的推荐历史。
	 *
	 * 包括：
	 *
	 * unread
	 * read
	 */
	async listReceived(
		currentUserId: string,
	): Promise<Recommendation[]> {
		const headers =
			await this.repository
				.findReceived(
					currentUserId,
				);

		return this.buildRecommendations(
			headers,
		);
	}

	/**
	 * 我发出的推荐历史。
	 */
	async listSent(
		currentUserId: string,
	): Promise<Recommendation[]> {
		const headers =
			await this.repository
				.findSent(
					currentUserId,
				);

		return this.buildRecommendations(
			headers,
		);
	}

	// ============================================================
	// Detail
	// ============================================================

	/**
	 * 查询一条推荐。
	 *
	 * sender 或 receiver 都可以查看。
	 */
	async getRecommendation(
		currentUserId: string,
		recommendationId: string,
	): Promise<Recommendation> {
		const header =
			await this.repository
				.findAccessibleById(
					recommendationId,
					currentUserId,
				);

		/**
		 * 对无权限用户也返回 404，
		 * 不暴露 recommendation 是否存在。
		 */
		if (!header) {
			throw new RecommendationServiceError(
				'Recommendation not found',
				404,
			);
		}

		const result =
			await this.buildRecommendations(
				[
					header,
				],
			);

		if (
			result.length === 0
		) {
			throw new RecommendationServiceError(
				'Recommendation not found',
				404,
			);
		}

		return result[0];
	}

	// ============================================================
	// Read
	// ============================================================

	/**
	 * 标记推荐已读。
	 *
	 * PATCH
	 * /api/recommendations/:id/read
	 *
	 * 只有 receiver 可以执行。
	 *
	 * 已经读过再次调用也是安全的，
	 * 不会重置 read_at。
	 */
	async markAsRead(
		currentUserId: string,
		recommendationId: string,
	): Promise<Recommendation> {
		const recommendation =
			await this.repository
				.findReceivedById(
					recommendationId,
					currentUserId,
				);

		if (!recommendation) {
			throw new RecommendationServiceError(
				'Recommendation not found',
				404,
			);
		}

		await this.repository
			.markRead(
				recommendationId,
				currentUserId,
			);

		/**
		 * 重新查询，
		 * 返回带最新 readAt 的对象。
		 */
		return this.getRecommendation(
			currentUserId,
			recommendationId,
		);
	}

	// ============================================================
	// Recommendation image
	// ============================================================

	/**
	 * 推荐历史里的图片权限验证。
	 *
	 * 与 friend wardrobe 不同：
	 *
	 * 历史推荐不要求双方现在仍然是好友。
	 *
	 * 也不要求衣物现在仍是 public。
	 *
	 * 只要求：
	 *
	 * 1. recommendation_items 中有这件衣物
	 * 2. 当前用户是 sender 或 receiver
	 */
	async getRecommendationClothingForImage(
		currentUserId: string,
		recommendationId: string,
		clothingId: string,
	): Promise<ClothingRow> {
		const clothing =
			await this.repository
				.findAccessibleItemClothing(
					recommendationId,
					clothingId,
					currentUserId,
				);

		if (!clothing) {
			throw new RecommendationServiceError(
				'Recommendation clothing not found',
				404,
			);
		}

		return clothing;
	}

	// ============================================================
	// Build DTO
	// ============================================================

	/**
	 * 把：
	 *
	 * recommendation header
	 *
	 * +
	 *
	 * recommendation_items
	 *
	 * +
	 *
	 * clothing
	 *
	 * 合并成最终 Flutter DTO。
	 */
	private async buildRecommendations(
		headers:
			RecommendationWithUsersRow[],
	): Promise<Recommendation[]> {
		if (
			headers.length === 0
		) {
			return [];
		}

		// --------------------------------------------------------
		// 一次查询所有衣物
		// --------------------------------------------------------

		const recommendationIds =
			headers.map(
				(item) =>
					item.id,
			);

		const itemRows =
			await this.repository
				.findItemsByRecommendationIds(
					recommendationIds,
				);

		// --------------------------------------------------------
		// recommendationId -> clothing rows
		// --------------------------------------------------------

		const clothingMap =
			new Map<
				string,
				RecommendationItemClothingRow[]
			>();

		for (
			const item
			of itemRows
		) {
			const existing =
				clothingMap.get(
					item.recommendation_id,
				);

			if (existing) {
				existing.push(
					item,
				);
			} else {
				clothingMap.set(
					item.recommendation_id,
					[
						item,
					],
				);
			}
		}

		// --------------------------------------------------------
		// Map recommendation
		// --------------------------------------------------------

		return headers.map(
			(header) => {
				const clothes =
					(
						clothingMap.get(
							header.id,
						) ?? []
					).map(
						(item) =>
							this.mapClothing(
								item,
								header.id,
							),
					);

				return this.mapRecommendation(
					header,
					clothes,
				);
			},
		);
	}

	// ============================================================
	// Map Recommendation
	// ============================================================

	private mapRecommendation(
		row:
			RecommendationWithUsersRow,
		clothes: Clothing[],
	): Recommendation {
		const fromUser:
			PublicUser = {
			id:
				row.sender_id,

			username:
				row.sender_username,

			email:
				row.sender_email,

			avatarUrl:
				row.sender_avatar_url ??
				'',
		};

		const toUser:
			PublicUser = {
			id:
				row.receiver_id,

			username:
				row.receiver_username,

			email:
				row.receiver_email,

			avatarUrl:
				row.receiver_avatar_url ??
				'',
		};

		return {
			id:
				row.id,

			fromUser,

			toUser,

			clothes,

			message:
				row.message,

			createdAt:
				row.created_at,

			readAt:
				row.read_at,

			isRead:
				row.read_at !== null,
		};
	}

	// ============================================================
	// Map Clothing
	// ============================================================

	/**
	 * 注意 imageUrl：
	 *
	 * 推荐历史中的图片必须使用
	 * recommendation 专用 endpoint。
	 */
	private mapClothing(
		row:
			RecommendationItemClothingRow,
		recommendationId: string,
	): Clothing {
		return {
			id:
				row.id,

			ownerId:
				row.owner_id,

			name:
				row.name,

			brand:
				row.brand,

			category:
				row.category,

			color:
				row.color,

			season:
				row.season,

			price:
				row.price,

			imageUrl:
				row.image_url
					? `/api/recommendations/${recommendationId}/clothing/${row.id}/image`
					: '',

			visibility:
				row.visibility,

			createdAt:
				row.created_at,

			updatedAt:
				row.updated_at,
		};
	}
}

// ============================================================
// Validation
// ============================================================

function requireObject(
	value: unknown,
): Record<string, unknown> {
	if (
		typeof value !== 'object' ||
		value === null ||
		Array.isArray(value)
	) {
		throw new RecommendationServiceError(
			'Invalid request body',
			400,
		);
	}

	return value as Record<
		string,
		unknown
	>;
}

function requireText(
	value: unknown,
	message: string,
): string {
	if (
		typeof value !==
		'string'
	) {
		throw new RecommendationServiceError(
			message,
			400,
		);
	}

	const normalized =
		value.trim();

	if (!normalized) {
		throw new RecommendationServiceError(
			message,
			400,
		);
	}

	return normalized;
}

/**
 * 校验衣物 ID 数组。
 *
 * 同时去除重复 ID。
 */
function parseClothingIds(
	value: unknown,
): string[] {
	if (
		!Array.isArray(value)
	) {
		throw new RecommendationServiceError(
			'clothingIds must be an array',
			400,
		);
	}

	if (
		value.length === 0
	) {
		throw new RecommendationServiceError(
			'At least one clothing item is required',
			400,
		);
	}

	if (
		value.length >
		MAX_CLOTHING_ITEMS
	) {
		throw new RecommendationServiceError(
			`A recommendation can contain at most ${MAX_CLOTHING_ITEMS} clothing items`,
			400,
		);
	}

	const ids:
		string[] = [];

	const seen =
		new Set<string>();

	for (
		const item
		of value
	) {
		if (
			typeof item !==
			'string'
		) {
			throw new RecommendationServiceError(
				'Invalid clothing id',
				400,
			);
		}

		const id =
			item.trim();

		if (!id) {
			throw new RecommendationServiceError(
				'Invalid clothing id',
				400,
			);
		}

		/**
		 * 自动去掉重复 ID，
		 * 避免 recommendation_items
		 * PRIMARY KEY 冲突。
		 */
		if (
			!seen.has(
				id,
			)
		) {
			seen.add(
				id,
			);

			ids.push(
				id,
			);
		}
	}

	if (
		ids.length === 0
	) {
		throw new RecommendationServiceError(
			'At least one clothing item is required',
			400,
		);
	}

	return ids;
}

// ============================================================
// Error
// ============================================================

export class RecommendationServiceError
	extends Error {
	constructor(
		message: string,

		public readonly status:
			number,
	) {
		super(
			message,
		);

		this.name =
			'RecommendationServiceError';
	}
}