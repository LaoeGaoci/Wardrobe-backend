import {
	FriendRepository,
} from '../../repositories/friends/friend_repository';

import {
	RecommendationRepository,
} from '../../repositories/friends/recommendation_repository';

import {
	UserRepository,
} from '../../repositories/user/user_repository';

import {
	generateId,
} from '../../utils/id';

import type {
	Clothing,
	ClothingRow,
} from '../../types/clothing/clothing';

import type {
	PublicUser,
} from '../../types/user/user';

import type {
	Recommendation,
	RecommendationItemClothingRow,
	RecommendationWithUsersRow,
} from '../../types/friends/recommendation';

// ============================================================
// Validation limits
// ============================================================

const MESSAGE_MAX_LENGTH =
	200;

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

		if (
			message.length >
			MESSAGE_MAX_LENGTH
		) {
			throw new RecommendationServiceError(
				`Recommendation message must be at most ${MESSAGE_MAX_LENGTH} characters`,
				400,
			);
		}

		if (
			currentUserId ===
			toUserId
		) {
			throw new RecommendationServiceError(
				'Cannot recommend clothing to yourself',
				400,
			);
		}

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

		const availableClothes =
			await this.repository
				.findPublicOwnedClothingByIds(
					toUserId,
					clothingIds,
				);

		if (
			availableClothes.length !==
			clothingIds.length
		) {
			throw new RecommendationServiceError(
				'One or more clothing items are unavailable',
				400,
			);
		}

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

		return this.getRecommendation(
			currentUserId,
			recommendationId,
		);
	}

	// ============================================================
	// Home unread stack
	// ============================================================

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

		return this.getRecommendation(
			currentUserId,
			recommendationId,
		);
	}

	// ============================================================
	// Recommendation image
	// ============================================================

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

	private async buildRecommendations(
		headers:
			RecommendationWithUsersRow[],
	): Promise<Recommendation[]> {
		if (
			headers.length === 0
		) {
			return [];
		}

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
