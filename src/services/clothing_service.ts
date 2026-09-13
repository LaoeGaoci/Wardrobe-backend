import {
	ClothingRepository,
} from '../repositories/clothing_repository';

import type {
	Clothing,
	ClothingListFilters,
	ClothingRow,
	ClothingVisibility,
	CreateClothingRecord,
	UpdateClothingRecord,
} from '../types/clothing';

import {
	generateId,
} from '../utils/id';

const NAME_MAX_LENGTH = 100;

const BRAND_MAX_LENGTH = 100;

const CATEGORY_MAX_LENGTH = 50;

const COLOR_MAX_LENGTH = 50;

const SEASON_MAX_LENGTH = 50;

const SEARCH_MAX_LENGTH = 100;

const MAX_PRICE = 1_000_000_000;

export class ClothingService {
	private readonly repository:
		ClothingRepository;

	constructor(
		db: D1Database,
	) {
		this.repository =
			new ClothingRepository(
				db,
			);
	}

	// ============================================================
	// List
	// ============================================================

	async listOwnedClothing(
		userId: string,
		input: {
			category?: unknown;
			query?: unknown;
			visibility?: unknown;
		},
	): Promise<Clothing[]> {
		const filters:
			ClothingListFilters = {};

		if (
			input.category !==
			undefined
		) {
			filters.category =
				parseOptionalFilterText(
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
				parseOptionalFilterText(
					input.query,
					'q',
					SEARCH_MAX_LENGTH,
				);
		}

		if (
			input.visibility !==
			undefined
		) {
			filters.visibility =
				parseVisibility(
					input.visibility,
				);
		}

		const rows =
			await this.repository
				.findAllOwned(
					userId,
					filters,
				);

		return rows.map(
			mapClothing,
		);
	}

	// ============================================================
	// Detail
	// ============================================================

	async getOwnedClothing(
		userId: string,
		clothingId: string,
	): Promise<Clothing> {
		const row =
			await this.repository
				.findOwnedById(
					clothingId,
					userId,
				);

		if (!row) {
			throw new ClothingServiceError(
				'Clothing not found',
				404,
			);
		}

		return mapClothing(
			row,
		);
	}

	// ============================================================
	// Create
	// ============================================================

	async createClothing(
		userId: string,
		input: unknown,
	): Promise<Clothing> {
		const body =
			requireObject(
				input,
			);

		const name =
			parseRequiredText(
				body.name,
				'name',
				NAME_MAX_LENGTH,
			);

		const brand =
			parseOptionalText(
				body.brand,
				'brand',
				BRAND_MAX_LENGTH,
			);

		const category =
			parseRequiredText(
				body.category,
				'category',
				CATEGORY_MAX_LENGTH,
			);

		const color =
			parseRequiredText(
				body.color,
				'color',
				COLOR_MAX_LENGTH,
			);

		const season =
			parseRequiredText(
				body.season,
				'season',
				SEASON_MAX_LENGTH,
			);

		const price =
			parsePrice(
				body.price,
			);

		const visibility:
			ClothingVisibility =
			body.visibility ===
			undefined
				? 'private'
				: parseVisibility(
						body.visibility,
					);

		const record:
			CreateClothingRecord = {
			id: generateId(),

			ownerId: userId,

			name,

			brand,

			category,

			color,

			season,

			price,

			imageKey: null,

			visibility,
		};

		await this.repository.create(
			record,
		);

		const created =
			await this.repository
				.findOwnedById(
					record.id,
					userId,
				);

		if (!created) {
			throw new ClothingServiceError(
				'Failed to create clothing',
				500,
			);
		}

		return mapClothing(
			created,
		);
	}

	// ============================================================
	// Update
	// ============================================================

	/**
	 * PATCH /api/clothing/:id
	 *
	 * 支持部分更新。
	 *
	 * 可以修改：
	 * - name
	 * - brand
	 * - category
	 * - color
	 * - season
	 * - price
	 * - visibility
	 *
	 * 不允许修改：
	 * - id
	 * - ownerId
	 * - image
	 * - createdAt
	 * - updatedAt
	 */
	async updateClothing(
		userId: string,
		clothingId: string,
		input: unknown,
	): Promise<Clothing> {
		const body =
			requireObject(
				input,
			);

		const current =
			await this.repository
				.findOwnedById(
					clothingId,
					userId,
				);

		if (!current) {
			throw new ClothingServiceError(
				'Clothing not found',
				404,
			);
		}

		const has = (
			key: string,
		): boolean =>
			Object.prototype
				.hasOwnProperty.call(
					body,
					key,
				);

		const editableFields = [
			'name',
			'brand',
			'category',
			'color',
			'season',
			'price',
			'visibility',
		];

		const hasEditableField =
			editableFields.some(
				(field) =>
					has(field),
			);

		if (!hasEditableField) {
			throw new ClothingServiceError(
				'No clothing fields to update',
				400,
			);
		}

		const update:
			UpdateClothingRecord = {
			name: has('name')
				? parseRequiredText(
						body.name,
						'name',
						NAME_MAX_LENGTH,
					)
				: current.name,

			brand: has('brand')
				? parseOptionalText(
						body.brand,
						'brand',
						BRAND_MAX_LENGTH,
					)
				: current.brand,

			category:
				has('category')
					? parseRequiredText(
							body.category,
							'category',
							CATEGORY_MAX_LENGTH,
						)
					: current.category,

			color: has('color')
				? parseRequiredText(
						body.color,
						'color',
						COLOR_MAX_LENGTH,
					)
				: current.color,

			season: has('season')
				? parseRequiredText(
						body.season,
						'season',
						SEASON_MAX_LENGTH,
					)
				: current.season,

			price: has('price')
				? parsePrice(
						body.price,
					)
				: current.price,

			visibility:
				has('visibility')
					? parseVisibility(
							body.visibility,
						)
					: current.visibility,
		};

		const updated =
			await this.repository
				.updateOwned(
					clothingId,
					userId,
					update,
				);

		if (!updated) {
			throw new ClothingServiceError(
				'Clothing not found',
				404,
			);
		}

		const row =
			await this.repository
				.findOwnedById(
					clothingId,
					userId,
				);

		if (!row) {
			throw new ClothingServiceError(
				'Clothing not found',
				404,
			);
		}

		return mapClothing(
			row,
		);
	}

	// ============================================================
	// Delete
	// ============================================================

	/**
	 * 返回删除前的数据，
	 * 让 Route 可以继续删除对应 R2 图片。
	 */
	async deleteClothing(
		userId: string,
		clothingId: string,
	): Promise<ClothingRow> {
		const current =
			await this.repository
				.findOwnedById(
					clothingId,
					userId,
				);

		if (!current) {
			throw new ClothingServiceError(
				'Clothing not found',
				404,
			);
		}

		const deleted =
			await this.repository
				.deleteOwned(
					clothingId,
					userId,
				);

		if (!deleted) {
			throw new ClothingServiceError(
				'Clothing not found',
				404,
			);
		}

		return current;
	}
}

// ============================================================
// DTO
// ============================================================

export function mapClothing(
	row: ClothingRow,
): Clothing {
	return {
		id: row.id,

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
				? `/api/clothing/${row.id}/image`
				: '',

		visibility:
			row.visibility,

		createdAt:
			row.created_at,

		updatedAt:
			row.updated_at,
	};
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
		throw new ClothingServiceError(
			'Invalid request body',
			400,
		);
	}

	return value as Record<
		string,
		unknown
	>;
}

function parseRequiredText(
	value: unknown,
	field: string,
	maxLength: number,
): string {
	if (
		typeof value !== 'string'
	) {
		throw new ClothingServiceError(
			`${field} is required`,
			400,
		);
	}

	const normalized =
		value.trim();

	if (!normalized) {
		throw new ClothingServiceError(
			`${field} cannot be empty`,
			400,
		);
	}

	validateLength(
		normalized,
		field,
		maxLength,
	);

	return normalized;
}

/**
 * undefined/null/空字符串
 * 都会转换成 null。
 */
function parseOptionalText(
	value: unknown,
	field: string,
	maxLength: number,
): string | null {
	if (
		value === undefined ||
		value === null
	) {
		return null;
	}

	if (
		typeof value !== 'string'
	) {
		throw new ClothingServiceError(
			`${field} must be a string`,
			400,
		);
	}

	const normalized =
		value.trim();

	if (!normalized) {
		return null;
	}

	validateLength(
		normalized,
		field,
		maxLength,
	);

	return normalized;
}

function parseOptionalFilterText(
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
		typeof value !== 'string'
	) {
		throw new ClothingServiceError(
			`${field} must be a string`,
			400,
		);
	}

	const normalized =
		value.trim();

	if (!normalized) {
		return undefined;
	}

	validateLength(
		normalized,
		field,
		maxLength,
	);

	return normalized;
}

function validateLength(
	value: string,
	field: string,
	maxLength: number,
): void {
	if (
		value.length >
		maxLength
	) {
		throw new ClothingServiceError(
			`${field} must be at most ${maxLength} characters`,
			400,
		);
	}
}

/**
 * null / undefined / ""
 * 都会转换成 null。
 *
 * PATCH 时前端因此可以清除价格：
 *
 * {
 *   "price": null
 * }
 */
function parsePrice(
	value: unknown,
): number | null {
	if (
		value === undefined ||
		value === null ||
		value === ''
	) {
		return null;
	}

	if (
		typeof value !== 'number' ||
		!Number.isFinite(value)
	) {
		throw new ClothingServiceError(
			'price must be a number',
			400,
		);
	}

	if (value < 0) {
		throw new ClothingServiceError(
			'price cannot be negative',
			400,
		);
	}

	if (
		value > MAX_PRICE
	) {
		throw new ClothingServiceError(
			'price is too large',
			400,
		);
	}

	return value;
}

function parseVisibility(
	value: unknown,
): ClothingVisibility {
	if (
		value === 'public' ||
		value === 'private'
	) {
		return value;
	}

	throw new ClothingServiceError(
		'visibility must be public or private',
		400,
	);
}

// ============================================================
// Error
// ============================================================

export class ClothingServiceError
	extends Error {
	constructor(
		message: string,
		public readonly status:
			400 |
			404 |
			413 |
			415 |
			500,
	) {
		super(message);

		this.name =
			'ClothingServiceError';
	}
}