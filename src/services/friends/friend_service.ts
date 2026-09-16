import {
	FriendRepository,
} from '../../repositories/friends/friend_repository';

import {
	UserRepository,
} from '../../repositories/user/user_repository';

import {
	ClothingRepository,
} from '../../repositories/clothing/clothing_repository';

import {
	generateId,
} from '../../utils/id';

import type {
	FriendRelation,
	FriendRequest,
	FriendRequestWithUsersRow,
	FriendStatus,
	FriendWithUserRow,
} from '../../types/friends/friend';

import type {
	PublicUser,
} from '../../types/user/user';

import type {
	Clothing,
	ClothingListFilters,
	ClothingRow,
} from '../../types/clothing/clothing';

// ============================================================
// Limits
// ============================================================

const REQUEST_MESSAGE_MAX_LENGTH =
	200;

const REMARK_MAX_LENGTH =
	50;

const SEARCH_MAX_LENGTH =
	100;

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

	async getFriendStatus(
		currentUserId: string,
		targetUserId: string,
	): Promise<FriendStatus> {
		if (
			currentUserId ===
			targetUserId
		) {
			return 'none';
		}

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

		if (
			currentUserId ===
			targetUserId
		) {
			throw new FriendServiceError(
				'Cannot add yourself as a friend',
				400,
			);
		}

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

				notificationId:
					generateId(),
			});

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

	async acceptFriendRequest(
		currentUserId: string,
		requestId: string,
	): Promise<FriendRelation> {
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
				generateId(),
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

			remark:
				row.nickname,

			createdAt:
				row.friendship_created_at,
		};
	}

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
	 * 好友公开图片使用：
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

			location:
				row.location,

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
