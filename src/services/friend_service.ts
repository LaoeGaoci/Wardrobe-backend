import {
	FriendRepository,
} from '../repositories/friend_repository';

import {
	UserRepository,
} from '../repositories/user_repository';

import {
	ClothingRepository,
} from '../repositories/clothing_repository';

import {
	generateId,
} from '../utils/id';

import type {
	FriendRelation,
	FriendRequest,
	FriendRequestWithUsersRow,
	FriendStatus,
	FriendWithUserRow,
} from '../types/friend';

import type {
	PublicUser,
} from '../types/user';

import type {
	Clothing,
	ClothingListFilters,
	ClothingRow,
} from '../types/clothing';

// ============================================================
// Limits
// ============================================================

/**
 * 好友申请文字最大长度。
 */
const REQUEST_MESSAGE_MAX_LENGTH =
	200;

/**
 * 好友备注最大长度。
 */
const REMARK_MAX_LENGTH =
	50;

/**
 * 好友衣柜搜索关键词最大长度。
 */
const SEARCH_MAX_LENGTH =
	100;

/**
 * 分类字段最大长度。
 */
const CATEGORY_MAX_LENGTH =
	50;

// ============================================================
// Service
// ============================================================

export class FriendService {
	private readonly friendRepository:
		FriendRepository;

	private readonly userRepository:
		UserRepository;

	private readonly clothingRepository:
		ClothingRepository;

	constructor(
		db: D1Database,
	) {
		this.friendRepository =
			new FriendRepository(
				db,
			);

		this.userRepository =
			new UserRepository(
				db,
			);

		this.clothingRepository =
			new ClothingRepository(
				db,
			);
	}

	// ============================================================
	// Friend list
	// ============================================================

	/**
	 * 获取当前用户的好友列表。
	 *
	 * GET /api/friends
	 */
	async listFriends(
		currentUserId: string,
	): Promise<FriendRelation[]> {
		const rows =
			await this.friendRepository
				.findFriends(
					currentUserId,
				);

		return rows.map(
			(row) =>
				this.mapFriend(
					row,
				),
		);
	}

	// ============================================================
	// Friend status
	// ============================================================

	/**
	 * 获取当前用户和指定用户之间的状态。
	 *
	 * 优先级：
	 *
	 * 1. friends
	 * 2. requestSent
	 * 3. requestReceived
	 * 4. none
	 */
	async getFriendStatus(
		currentUserId: string,
		targetUserId: string,
	): Promise<FriendStatus> {
		/**
		 * 自己和自己不存在好友状态。
		 */
		if (
			currentUserId ===
			targetUserId
		) {
			return 'none';
		}

		/**
		 * 如果目标用户不存在，
		 * 返回 404，
		 * 避免对不存在 userId 继续查询。
		 */
		const targetExists =
			await this.userRepository
				.existsById(
					targetUserId,
				);

		if (!targetExists) {
			throw new FriendServiceError(
				'User not found',
				404,
			);
		}

		const isFriend =
			await this.friendRepository
				.isFriend(
					currentUserId,
					targetUserId,
				);

		if (isFriend) {
			return 'friends';
		}

		const outgoing =
			await this.friendRepository
				.findPendingRequest(
					currentUserId,
					targetUserId,
				);

		if (outgoing) {
			return 'requestSent';
		}

		const incoming =
			await this.friendRepository
				.findPendingRequest(
					targetUserId,
					currentUserId,
				);

		if (incoming) {
			return 'requestReceived';
		}

		return 'none';
	}

	// ============================================================
	// Friend requests - list
	// ============================================================

	/**
	 * 获取当前用户收到的 pending 申请。
	 */
	async listReceivedRequests(
		currentUserId: string,
	): Promise<FriendRequest[]> {
		const rows =
			await this.friendRepository
				.findReceivedRequests(
					currentUserId,
				);

		return rows.map(
			(row) =>
				this.mapRequest(
					row,
				),
		);
	}

	/**
	 * 获取当前用户发出的 pending 申请。
	 */
	async listSentRequests(
		currentUserId: string,
	): Promise<FriendRequest[]> {
		const rows =
			await this.friendRepository
				.findSentRequests(
					currentUserId,
				);

		return rows.map(
			(row) =>
				this.mapRequest(
					row,
				),
		);
	}

	// ============================================================
	// Send friend request
	// ============================================================

	/**
	 * 发送好友申请。
	 *
	 * POST /api/friends/requests
	 *
	 * Body:
	 *
	 * {
	 *   "userId": "...",
	 *   "message": "你好..."
	 * }
	 */
	async sendFriendRequest(
		currentUserId: string,
		input: unknown,
	): Promise<FriendRequest> {
		const body =
			requireObject(
				input,
			);

		const targetUserId =
			requireText(
				body.userId,
				'userId is required',
			);

		const message =
			requireText(
				body.message,
				'Friend request message is required',
			);

		if (
			message.length >
			REQUEST_MESSAGE_MAX_LENGTH
		) {
			throw new FriendServiceError(
				`Friend request message must be at most ${REQUEST_MESSAGE_MAX_LENGTH} characters`,
				400,
			);
		}

		/**
		 * 不允许添加自己。
		 */
		if (
			currentUserId ===
			targetUserId
		) {
			throw new FriendServiceError(
				'Cannot add yourself as a friend',
				400,
			);
		}

		/**
		 * 目标用户必须存在。
		 */
		const targetUser =
			await this.userRepository
				.findPublicById(
					targetUserId,
				);

		if (!targetUser) {
			throw new FriendServiceError(
				'User not found',
				404,
			);
		}

		/**
		 * 已经是好友。
		 */
		if (
			await this.friendRepository
				.isFriend(
					currentUserId,
					targetUserId,
				)
		) {
			throw new FriendServiceError(
				'User is already your friend',
				409,
			);
		}

		/**
		 * 当前用户已经发送过申请。
		 */
		const outgoing =
			await this.friendRepository
				.findPendingRequest(
					currentUserId,
					targetUserId,
				);

		if (outgoing) {
			throw new FriendServiceError(
				'Friend request already sent',
				409,
			);
		}

		/**
		 * 对方已经向当前用户发送申请。
		 *
		 * 这时不要再创建反向申请，
		 * 应让用户去“收到的申请”中处理。
		 */
		const incoming =
			await this.friendRepository
				.findPendingRequest(
					targetUserId,
					currentUserId,
				);

		if (incoming) {
			throw new FriendServiceError(
				'This user has already sent you a friend request',
				409,
			);
		}

		const requestId =
			generateId();

		await this.friendRepository
			.createRequest({
				id:
					requestId,

				senderId:
					currentUserId,

				receiverId:
					targetUserId,

				message,
			});

		/**
		 * 创建完成后重新 JOIN users，
		 * 返回 Flutter 可以直接使用的 DTO。
		 */
		const created =
			await this.friendRepository
				.findRequestWithUsers(
					requestId,
				);

		if (!created) {
			throw new FriendServiceError(
				'Failed to create friend request',
				500,
			);
		}

		return this.mapRequest(
			created,
		);
	}

	// ============================================================
	// Accept friend request
	// ============================================================

	/**
	 * 接受好友申请。
	 *
	 * POST
	 * /api/friends/requests/:requestId/accept
	 */
	async acceptFriendRequest(
		currentUserId: string,
		requestId: string,
	): Promise<FriendRelation> {
		/**
		 * 必须满足：
		 *
		 * receiver_id == JWT currentUserId
		 * status == pending
		 */
		const request =
			await this.friendRepository
				.findPendingReceivedRequest(
					requestId,
					currentUserId,
				);

		if (!request) {
			throw new FriendServiceError(
				'Friend request not found',
				404,
			);
		}

		await this.friendRepository
			.acceptRequest(
				request,

				/**
				 * 当前用户 -> 申请发送者。
				 */
				generateId(),

				/**
				 * 申请发送者 -> 当前用户。
				 */
				generateId(),
			);

		const friend =
			await this.friendRepository
				.findFriendWithUser(
					currentUserId,
					request.sender_id,
				);

		if (!friend) {
			throw new FriendServiceError(
				'Failed to create friendship',
				500,
			);
		}

		return this.mapFriend(
			friend,
		);
	}

	// ============================================================
	// Reject friend request
	// ============================================================

	/**
	 * 拒绝申请。
	 *
	 * 数据库不删除，
	 * 而是：
	 *
	 * pending -> rejected
	 */
	async rejectFriendRequest(
		currentUserId: string,
		requestId: string,
	): Promise<void> {
		const request =
			await this.friendRepository
				.findPendingReceivedRequest(
					requestId,
					currentUserId,
				);

		if (!request) {
			throw new FriendServiceError(
				'Friend request not found',
				404,
			);
		}

		const updated =
			await this.friendRepository
				.rejectRequest(
					requestId,
					currentUserId,
				);

		if (!updated) {
			throw new FriendServiceError(
				'Friend request not found',
				404,
			);
		}
	}

	// ============================================================
	// Cancel sent request
	// ============================================================

	/**
	 * 当前用户撤回自己发送的申请。
	 *
	 * DELETE
	 * /api/friends/requests/:requestId
	 */
	async cancelFriendRequest(
		currentUserId: string,
		requestId: string,
	): Promise<void> {
		const request =
			await this.friendRepository
				.findPendingSentRequest(
					requestId,
					currentUserId,
				);

		if (!request) {
			throw new FriendServiceError(
				'Friend request not found',
				404,
			);
		}

		const deleted =
			await this.friendRepository
				.cancelSentRequest(
					requestId,
					currentUserId,
				);

		if (!deleted) {
			throw new FriendServiceError(
				'Friend request not found',
				404,
			);
		}
	}

	// ============================================================
	// Remark
	// ============================================================

	/**
	 * 修改当前用户给某个好友设置的备注。
	 *
	 * PATCH /api/friends/:friendId
	 *
	 * Body:
	 *
	 * {
	 *   "remark": "妈妈"
	 * }
	 */
	async updateRemark(
		currentUserId: string,
		friendId: string,
		input: unknown,
	): Promise<FriendRelation> {
		const body =
			requireObject(
				input,
			);

		if (
			typeof body.remark !==
			'string'
		) {
			throw new FriendServiceError(
				'remark must be a string',
				400,
			);
		}

		/**
		 * 允许空字符串：
		 *
		 * ""
		 *
		 * 表示清除备注。
		 */
		const remark =
			body.remark.trim();

		if (
			remark.length >
			REMARK_MAX_LENGTH
		) {
			throw new FriendServiceError(
				`remark must be at most ${REMARK_MAX_LENGTH} characters`,
				400,
			);
		}

		const updated =
			await this.friendRepository
				.updateRemark(
					currentUserId,
					friendId,
					remark,
				);

		if (!updated) {
			throw new FriendServiceError(
				'Friend not found',
				404,
			);
		}

		const friend =
			await this.friendRepository
				.findFriendWithUser(
					currentUserId,
					friendId,
				);

		if (!friend) {
			throw new FriendServiceError(
				'Friend not found',
				404,
			);
		}

		return this.mapFriend(
			friend,
		);
	}

	// ============================================================
	// Delete friend
	// ============================================================

	/**
	 * 删除好友。
	 *
	 * DELETE /api/friends/:friendId
	 *
	 * 删除双方关系：
	 *
	 * current -> friend
	 * friend -> current
	 */
	async removeFriend(
		currentUserId: string,
		friendId: string,
	): Promise<void> {
		const relation =
			await this.friendRepository
				.findFriendship(
					currentUserId,
					friendId,
				);

		if (!relation) {
			throw new FriendServiceError(
				'Friend not found',
				404,
			);
		}

		await this.friendRepository
			.deleteFriendshipPair(
				currentUserId,
				friendId,
			);
	}

	// ============================================================
	// Friend wardrobe
	// ============================================================

	/**
	 * 查看好友衣柜。
	 *
	 * GET
	 * /api/friends/:friendId/clothing
	 *
	 * 只允许：
	 *
	 * 1. 双方是好友
	 * 2. visibility = public
	 */
	async listFriendClothing(
		currentUserId: string,
		friendId: string,
		input: {
			category?: unknown;
			query?: unknown;
		},
	): Promise<Clothing[]> {
		await this.requireFriendship(
			currentUserId,
			friendId,
		);

		const filters:
			ClothingListFilters = {
			/**
			 * 无论前端传什么，
			 * 好友衣柜永远只看 public。
			 */
			visibility:
				'public',
		};

		if (
			input.category !==
			undefined
		) {
			filters.category =
				parseOptionalFilter(
					input.category,
					'category',
					CATEGORY_MAX_LENGTH,
				);
		}

		if (
			input.query !==
			undefined
		) {
			filters.query =
				parseOptionalFilter(
					input.query,
					'q',
					SEARCH_MAX_LENGTH,
				);
		}

		const rows =
			await this.clothingRepository
				.findAllOwned(
					friendId,
					filters,
				);

		return rows.map(
			(row) =>
				this.mapFriendClothing(
					row,
					friendId,
				),
		);
	}

	/**
	 * 获取好友某一件公开衣物的数据库记录。
	 *
	 * 图片接口会调用这个方法做权限校验。
	 */
	async getFriendPublicClothing(
		currentUserId: string,
		friendId: string,
		clothingId: string,
	): Promise<ClothingRow> {
		await this.requireFriendship(
			currentUserId,
			friendId,
		);

		const clothing =
			await this.clothingRepository
				.findOwnedById(
					clothingId,
					friendId,
				);

		/**
		 * 这里把 private 衣物也统一返回 404。
		 *
		 * 不向好友暴露：
		 *
		 * “这件衣服其实存在，只是你没有权限”
		 *
		 * 这样的信息。
		 */
		if (
			!clothing ||
			clothing.visibility !==
				'public'
		) {
			throw new FriendServiceError(
				'Clothing not found',
				404,
			);
		}

		return clothing;
	}

	// ============================================================
	// Authorization helper
	// ============================================================

	/**
	 * 要求 currentUserId 与 friendId
	 * 已经建立好友关系。
	 */
	private async requireFriendship(
		currentUserId: string,
		friendId: string,
	): Promise<void> {
		if (
			currentUserId ===
			friendId
		) {
			throw new FriendServiceError(
				'Cannot access yourself through friend API',
				400,
			);
		}

		const isFriend =
			await this.friendRepository
				.isFriend(
					currentUserId,
					friendId,
				);

		if (!isFriend) {
			throw new FriendServiceError(
				'User is not your friend',
				403,
			);
		}
	}

	// ============================================================
	// Mapping
	// ============================================================

	/**
	 * D1 JOIN row -> Flutter FriendRelation
	 */
	private mapFriend(
		row: FriendWithUserRow,
	): FriendRelation {
		return {
			user: {
				id:
					row.friend_id,

				username:
					row.username,

				email:
					row.email,

				avatarUrl:
					row.avatar_url ??
					'',
			},

			/**
			 * DB nickname
			 * ->
			 * API remark
			 */
			remark:
				row.nickname,

			createdAt:
				row.friendship_created_at,
		};
	}

	/**
	 * friend_requests JOIN row
	 * ->
	 * Flutter FriendRequest。
	 */
	private mapRequest(
		row: FriendRequestWithUsersRow,
	): FriendRequest {
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

			message:
				row.message ??
				'',

			createdAt:
				row.created_at,
		};
	}

	/**
	 * 好友衣柜 DTO。
	 *
	 * 与普通 Clothing DTO 唯一重要区别：
	 *
	 * imageUrl 不再使用：
	 *
	 * /api/clothing/:id/image
	 *
	 * 因为那个接口要求 owner。
	 *
	 * 好友公开图片使用：
	 *
	 * /api/friends/:friendId/clothing/:id/image
	 */
	private mapFriendClothing(
		row: ClothingRow,
		friendId: string,
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
					? `/api/friends/${friendId}/clothing/${row.id}/image`
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
// Validation helpers
// ============================================================

function requireObject(
	value: unknown,
): Record<string, unknown> {
	if (
		typeof value !== 'object' ||
		value === null ||
		Array.isArray(value)
	) {
		throw new FriendServiceError(
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
		throw new FriendServiceError(
			message,
			400,
		);
	}

	const normalized =
		value.trim();

	if (!normalized) {
		throw new FriendServiceError(
			message,
			400,
		);
	}

	return normalized;
}

function parseOptionalFilter(
	value: unknown,
	field: string,
	maxLength: number,
): string | undefined {
	if (
		value === undefined ||
		value === null
	) {
		return undefined;
	}

	if (
		typeof value !==
		'string'
	) {
		throw new FriendServiceError(
			`${field} must be a string`,
			400,
		);
	}

	const normalized =
		value.trim();

	if (!normalized) {
		return undefined;
	}

	if (
		normalized.length >
		maxLength
	) {
		throw new FriendServiceError(
			`${field} must be at most ${maxLength} characters`,
			400,
		);
	}

	return normalized;
}

// ============================================================
// Error
// ============================================================

/**
 * Friend 模块统一业务异常。
 *
 * index.ts 会把它转换成：
 *
 * {
 *   "error": "..."
 * }
 */
export class FriendServiceError
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
			'FriendServiceError';
	}
}